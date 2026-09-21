/* ============================================================
   Book It — Shared utilities (app.js)
   ============================================================ */

import {
  db, auth, doc, getDoc, getDocs, collection, query, where, limit, increment, serverTimestamp,
  runTransaction, onSnapshot, updateDoc, setDoc, deleteDoc, deleteField, writeBatch
} from './firebase.js';
import {
  timeToMin, minToTime, isValidDateStr, nowInTimezone, resolveDayWindow, generateSlots, checkSlot,
  canTransition, clientCanCancel, BLOCKING_STATUSES, occupiedFromAgenda, agendaId,
  isEmail, isPhone, isHexColor, isSlug, clampStr, validateBookingInput, applyDiscount,
  buildICS, googleCalendarUrl, addDaysStr, weekdayOf, WEEKDAY_KEYS as CORE_WEEKDAY_KEYS,
  normalizePhone, formatPhonePT, randomToken, manageUrl, whatsAppUrl, firstName, dateLabelPT, messageText,
  layoutServices, normaliseSegments, segmentsDuration, hasGap, busyAt, MAX_SERVICES_PER_BOOKING,
  staffCanDo, staffFor, withTimeout, sleep,
} from './booking-core.js';

// Re-export the pure core so pages import everything from one place.
export {
  timeToMin, minToTime, isValidDateStr, nowInTimezone, resolveDayWindow, generateSlots, checkSlot,
  canTransition, clientCanCancel, BLOCKING_STATUSES, occupiedFromAgenda, agendaId,
  isEmail, isPhone, isHexColor, isSlug, clampStr, validateBookingInput, applyDiscount,
  buildICS, googleCalendarUrl, addDaysStr, weekdayOf,
  normalizePhone, formatPhonePT, randomToken, manageUrl, whatsAppUrl, firstName, dateLabelPT, messageText,
  layoutServices, normaliseSegments, segmentsDuration, hasGap, busyAt, MAX_SERVICES_PER_BOOKING,
  staffCanDo, staffFor, withTimeout, sleep,
};

/** Public origin of the app (for links sent to clients). */
export const APP_BASE_URL = (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.startsWith('file:'))
  ? window.location.origin : 'https://bookit-51575.web.app';

/* ── Who is doing this ────────────────────────────────────────────────────
   With one shared login per salon, every action read as "equipa" and nobody
   could say who cancelled an appointment or took a payment. Each page sets the
   signed-in person once; the mutations below stamp it onto what they write.
   One person is signed in per page, so a module-level value is the honest
   shape here — threading it through forty call sites would not add truth.    */
let _actor = null;
/** @param {{uid:string, name:string, role:'admin'|'team'|'member'}|null} a */
export function setActor(a) { _actor = a && a.uid ? { uid: a.uid, name: clampStr(a.name || '', 80), role: a.role || 'member' } : null; }
export function getActor() { return _actor; }
/** Stamp for an action: `stampedBy('cancelled')` → { cancelledByUid, cancelledByName }. */
function stampedBy(action) {
  if (!_actor) return {};
  return { [`${action}ByUid`]: _actor.uid, [`${action}ByName`]: _actor.name || _actor.role };
}

/* ── Errors ───────────────────────────────────────────────────────────────
   An error in somebody's browser is invisible: `console.error` writes to a
   console nobody will ever open. Worse, an uncaught error or a rejected
   promise leaves no trace at all, so the salon says "às vezes não dá" and
   there is nothing to look at.

   What this does: keeps a short trail of what the person was doing, catches
   what would otherwise vanish, and — for a signed-in salon session, where
   there is already a write path and therefore no new door to abuse — records
   distinct errors so an operator can read them later with `npm run errors`.

   Deliberately NOT done: a public write path for errors from the booking page.
   Anyone could fill it, and that is exactly the kind of hole this project has
   already had to close twice. Those need Sentry (see SENTRY_DSN below).       */

/** Paste a DSN here to also send errors to Sentry. Empty = does nothing.
 *  A Sentry DSN is public by design — it identifies a project, it is not a key.
 *  Remember to add the ingest host to `connect-src` in firebase.json. */
const SENTRY_DSN = '';

const trail = [];
const MAX_TRAIL = 20;
/** Note something the person just did, so an error has a story around it. */
export function breadcrumb(what, data = null) {
  trail.push({ t: new Date().toISOString().slice(11, 19), what: clampStr(what, 80), ...(data ? { data: clampStr(JSON.stringify(data), 200) } : {}) });
  if (trail.length > MAX_TRAIL) trail.shift();
}

/** Strip anything that looks like a person out of a message before storing it. */
function scrub(s) {
  return String(s ?? '')
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, '‹email›')
    // Optional country code, in the four shapes people write it. No leading
    // \b: it cannot match before a "+", which let "+351…" through untouched.
    // The lookarounds stop a long id from being mistaken for a number.
    .replace(/(?<!\d)(?:(?:\+|00)?351[\s.-]?)?9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}(?!\d)/g, '‹telemóvel›')
    .slice(0, 300);
}

/**
 * Same error, same place → same fingerprint, so repeats become a counter.
 *
 * The message is part of it, with digits and ids flattened first: without it,
 * two unrelated failures in the same handler collapse into one document and
 * the second silently overwrites the first — which is how you end up reading
 * a count of 40 and only ever seeing the last message.
 */
function fingerprint(code, where, message) {
  const shape = String(message || '').replace(/\d+/g, '#').replace(/\s+/g, ' ').slice(0, 80);
  let h = 0x811c9dc5;
  for (const ch of `${code}|${where}|${shape}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'e_' + h.toString(16).padStart(8, '0');
}

let reportedThisSession = 0;
const REPORT_CAP = 20;          // a loop must not be able to write forever
let errorSalonId = null;        // set by the salon-facing pages

/** Tell the reporter which salon this session belongs to. */
export function setErrorScope(salonId) { errorSalonId = salonId || null; }

/**
 * Record an error. Never throws, never blocks, never waits.
 * @param {Error|any} e
 * @param {string} where  what was being attempted, in plain words
 */
export function reportError(e, where = '') {
  const code = (e && (e.code || e.name)) || 'erro';
  const message = scrub(e?.message || String(e));
  console.error(`[${where || 'app'}]`, e);

  if (typeof window === 'undefined') return;
  if (reportedThisSession++ >= REPORT_CAP) return;

  const payload = {
    code: clampStr(code, 60), message, where: clampStr(where, 80),
    page: location.pathname.replace(/^\//, '') || 'index.html',
    agent: clampStr(navigator.userAgent, 200),
    trail: trail.slice(-8),
  };

  // Only from a signed-in salon session: no new public door.
  if (errorSalonId && auth.currentUser) {
    const id = fingerprint(payload.code, payload.where + '|' + payload.page, payload.message);
    setDoc(doc(db, 'salons', errorSalonId, '_errors', id), {
      ...payload, count: increment(1), lastAt: serverTimestamp(),
      firstAt: serverTimestamp(), uid: auth.currentUser.uid,
    }, { merge: true }).catch(() => {});   // reporting must never cause an error
  }

  if (SENTRY_DSN) sendToSentry(payload, e);
}

/** Sentry's envelope endpoint directly — no SDK, so nothing new to load. */
function sendToSentry(payload, e) {
  try {
    const m = /^https:\/\/([^@]+)@([^/]+)\/(.+)$/.exec(SENTRY_DSN);
    if (!m) return;
    const [, key, host, project] = m;
    const event = {
      event_id: (crypto.randomUUID?.() || String(Date.now())).replace(/-/g, ''),
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      logger: payload.where || 'app',
      message: { formatted: `${payload.code}: ${payload.message}` },
      extra: { page: payload.page, trail: payload.trail },
      exception: e?.stack ? { values: [{ type: payload.code, value: payload.message, stacktrace: { frames: [] } }] } : undefined,
    };
    const body = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n`
      + `${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
    fetch(`https://${host}/api/${project}/envelope/?sentry_key=${key}&sentry_version=7`,
      { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch { /* never let reporting break the page */ }
}

/** Catch what would otherwise vanish. Call once, early, on every page. */
export function installErrorReporting(salonId = null) {
  if (typeof window === 'undefined' || window.__bookitErrors) return;
  window.__bookitErrors = true;
  setErrorScope(salonId);
  window.addEventListener('error', (ev) => {
    if (ev.error || ev.message) reportError(ev.error || new Error(ev.message), 'erro-nao-apanhado');
  });
  window.addEventListener('unhandledrejection', (ev) => {
    reportError(ev.reason || new Error('promessa rejeitada'), 'promessa-rejeitada');
  });
}

/* ── Salon defaults (single source of truth for tunables) ── */
export const SALON_DEFAULTS = {
  timezone: 'Europe/Lisbon',
  slotInterval: 15,        // minutes between candidate start times
  bookingLeadMinutes: 30,  // minimum notice for same-day bookings
  maxAdvanceDays: 90,      // how far ahead clients may book
  cancellationHours: 24,   // client self-cancel cut-off
  loyaltyVisits: 5, loyaltyDiscount: 20, referralDiscount: 10, birthdayDiscount: 15,
  noShowPenalty: 5, pointsPerVisit: 10,
};
export const salonSetting = (salon, key) => (salon && salon[key] != null && salon[key] !== '') ? salon[key] : SALON_DEFAULTS[key];
/** How long to wait for a booking before going to look for it. Firestore's own
 *  retries take a while on a bad connection; 20 s is past patience for someone
 *  standing in the street with one bar of signal. */
export const BOOKING_TIMEOUT_MS = 20000;
/** Today's date string in the salon's timezone (use instead of todayISO() in salon-facing screens). */
export const todayForSalon = (salon) => nowInTimezone(salonSetting(salon, 'timezone')).dateStr;
/** Is the salon currently allowed to take bookings? Mirrors planActive() in firestore.rules. */
export function planActive(salon) {
  const plan = salon?.plan || 'active';
  if (plan === 'active') return true;
  if (plan === 'trial') {
    const t = salon.trialEndsAt;
    const ms = t?.toMillis ? t.toMillis() : (t?.seconds ? t.seconds * 1000 : Date.parse(t));
    return Number.isFinite(ms) && Date.now() < ms;
  }
  return false;
}

/* ── DOM ──────────────────────────────────────────────────── */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ── HTML escape & tagged templates ──────────────────────── */
const ESC = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
export const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

export function html(strings, ...values) {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += escapeHTML(values[i]);
  }
  return out;
}
export const raw = (s) => ({ __raw: true, value: String(s) });
export function htmlMix(strings, ...values) {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      out += v && v.__raw ? v.value : escapeHTML(v);
    }
  }
  return out;
}

/* ── Toast w/ undo ───────────────────────────────────────── */
let toastTimer;
let toastUndoFn = null;

function ensureToast() {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  return t;
}

/**
 * @param {object|string} opts  kind, or { kind, undo, action:{ label, run } }.
 *   `undo` is the classic 6-second escape hatch; `action` is any other single
 *   follow-up the moment calls for ("Avisar a cliente" after a reschedule).
 */
export function toast(msg, opts = {}) {
  const t = ensureToast();
  const kind = typeof opts === 'string' ? opts : (opts.kind || '');
  const undo = (typeof opts === 'object' && opts.undo) || null;
  const action = (typeof opts === 'object' && opts.action) || null;
  toastUndoFn = undo || (action ? action.run : null);

  t.className = '';
  if (kind) t.classList.add(`toast--${kind}`);
  t.innerHTML = '';

  const msgEl = document.createElement('span');
  msgEl.className = 'toast__msg';
  msgEl.textContent = msg;
  t.appendChild(msgEl);

  if (undo || action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast__action';
    btn.textContent = undo ? 'Anular' : action.label;
    btn.addEventListener('click', async () => {
      if (toastUndoFn) {
        const fn = toastUndoFn;
        toastUndoFn = null;
        t.classList.remove('show');
        await fn();
      }
    });
    t.appendChild(btn);
  }

  void t.offsetWidth; // restart animation
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    toastUndoFn = null;
  }, (undo || action) ? 8000 : 3000);
}
export const toastSuccess = (m, opts = {}) => toast(m, { ...opts, kind: 'success' });
export const toastError   = (m, opts = {}) => toast(m, { ...opts, kind: 'error' });
export const toastInfo    = (m, opts = {}) => toast(m, { ...opts, kind: 'info' });

/* ── Dates ───────────────────────────────────────────────── */
export const MONTHS_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
export const WEEKDAYS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
export const WEEKDAY_KEYS   = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export function formatDatePT(str, opts = {}) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  const months = opts.short ? MONTHS_SHORT : MONTHS_FULL;
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}
export function formatDateLongPT(date) {
  return `${date.getDate()} de ${MONTHS_FULL[date.getMonth()]} de ${date.getFullYear()}`;
}
export function todayISO() { return formatDate(new Date()); }
export function relativeDay(dateStr) {
  const today = todayISO();
  const tomorrow = formatDate(new Date(Date.now() + 86400000));
  if (dateStr === today)    return 'Hoje';
  if (dateStr === tomorrow) return 'Amanhã';
  return formatDatePT(dateStr, { short: true });
}

/* ── URL / Salon ─────────────────────────────────────────── */
/* Default salon when no ?salon=... query param. Points at the fully-populated
 * canonical demo (admin@bookit.demo / Demo2026!). The legacy "zenorganic"
 * salon is no longer the default because it's not fully provisioned. */
const DEFAULT_SALON = 'demo';
export function getSalonId() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('salon') || DEFAULT_SALON).trim();
}
export function salonQS(salonId) {
  return salonId === DEFAULT_SALON ? '' : `?salon=${encodeURIComponent(salonId)}`;
}

export function applySalonBranding(salon, opts = {}) {
  if (!salon) return;
  if (salon.primaryColor) {
    // accept hex; derive HSL for design tokens
    const hex = salon.primaryColor.replace('#','');
    document.documentElement.style.setProperty('--brand', salon.primaryColor);
    document.documentElement.style.setProperty('--brand-rgb', hexToRgb(hex));
  }
  const titleSuffix = opts.titleSuffix ?? salon.name;
  if (opts.titlePrefix && titleSuffix) {
    document.title = `${opts.titlePrefix} — ${titleSuffix}`;
  } else if (titleSuffix) {
    document.title = titleSuffix;
  }
  const set = (id, v) => { const el = $('#' + id); if (el && v != null) el.textContent = v; };
  set('headerName', salon.name || 'Book It');
  set('headerMark', (salon.name || 'B').charAt(0).toUpperCase());
  if (salon.tagline) set('headerSub', salon.tagline);
}
function hexToRgb(hex) {
  const h = hex.length === 3 ? hex.split('').map(c => c+c).join('') : hex;
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  return `${r}, ${g}, ${b}`;
}

export async function loadSalon(salonId) {
  try {
    const snap = await getDoc(doc(db, 'salons', salonId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.error('loadSalon', e);
    return null;
  }
}

/* ── Click delegation ────────────────────────────────────── */
const handlers = new Map();
export function on(action, fn) { handlers.set(action, fn); return () => handlers.delete(action); }
export function callAction(action, ...args) { const fn = handlers.get(action); return fn ? fn(...args) : null; }

const HAS_DOM = typeof document !== 'undefined';
if (HAS_DOM) {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const action = el.getAttribute('data-action');
    const fn = handlers.get(action);
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  /* Keyboard activation for non-button [role=button] */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target;
    if (el.getAttribute('role') === 'button' && el.hasAttribute('data-action')) {
      e.preventDefault();
      el.click();
    }
  });
}

/* ── Fatal error ─────────────────────────────────────────── */
export function showFatalError(msg) {
  const main = document.querySelector('main') || document.body;
  const isDemoAlready = getSalonId() === DEFAULT_SALON;
  main.innerHTML = `
    <div class="container" style="padding: 80px 0">
      <div class="error-state">
        <div class="error-state__icon" aria-hidden="true">⚠️</div>
        <div class="error-state__title">Algo correu mal</div>
        <div class="error-state__desc">${escapeHTML(msg)}</div>
        <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap">
          <button class="btn" type="button" data-action="reload-page">Tentar novamente</button>
          ${isDemoAlready ? '' : '<a class="btn btn--primary" href="?salon=' + DEFAULT_SALON + '">Ir para o salão demo</a>'}
        </div>
      </div>
    </div>`;
}
on('reload-page', () => location.reload());

/* ── Form helpers ────────────────────────────────────────── */
export function showFieldError(fieldId, msg) {
  const field = document.getElementById(fieldId)?.closest('.field');
  if (!field) return;
  field.setAttribute('data-invalid', 'true');
  let err = field.querySelector('.field__error');
  if (!err) {
    err = document.createElement('div');
    err.className = 'field__error';
    field.appendChild(err);
  }
  err.textContent = msg;
}
export function clearFieldErrors(root = document) {
  root.querySelectorAll('.field[data-invalid="true"]').forEach(f => {
    f.removeAttribute('data-invalid');
    const err = f.querySelector('.field__error');
    if (err) err.textContent = '';
  });
}

/* ── Firebase error mapping ──────────────────────────────── */
/** Map any thrown error (Firestore / Auth / our own codes) to a message a
 *  salon owner or client can act on. Never leaks internals. */
export function friendlyError(e, fallback = 'Ocorreu um erro. Tenta novamente.') {
  const code = (e && (e.code || e.message)) || '';
  const map = {
    'slot-taken':          'Esse horário acabou de ser ocupado. Escolhe outro.',
    'outside-hours':       'Esse horário está fora do horário de funcionamento.',
    'too-soon':            'Esse horário já não pode ser marcado com tão pouca antecedência.',
    'break':               'Esse horário coincide com a pausa do salão.',
    'salon-closed':        'O salão está fechado nesse dia.',
    'salon-closed-date':   'O salão está encerrado nessa data.',
    'staff-time-off':      'O colaborador está de férias/indisponível nessa data.',
    'staff-day-off':       'O colaborador não trabalha nesse dia.',
    'no-staff-available':  'Nenhum colaborador disponível nesse horário.',
    'staff-cannot-do-service': 'Esse colaborador não faz este serviço. Escolhe outro.',
    'invalid-transition':  'Esta ação já não é possível para o estado atual da marcação.',
    'booking-not-found':   'A marcação já não existe.',
    'booking-cancelled':   'A marcação está cancelada.',
    'booking-completed':   'A marcação já está concluída.',
    'booking-noshow':      'A marcação está marcada como não-comparência.',
    'cancel-too-late':     'Já não é possível cancelar com esta antecedência. Contacta o salão.',
    'plan-inactive':       'Este salão não está a aceitar marcações online neste momento.',
    'permission-denied':   'Sem permissão para esta ação. Inicia sessão novamente.',
    'unavailable':         'Sem ligação ao servidor. Verifica a internet e tenta de novo.',
    'failed-precondition': 'Operação não concluída. Atualiza a página e tenta de novo.',
    'deadline-exceeded':   'O pedido demorou demasiado. Tenta de novo.',
    'resource-exhausted':  'Limite de pedidos atingido. Aguarda um momento.',
    'aborted':             'Conflito ao guardar. Tenta de novo.',
    'timeout':             'A ligação está muito lenta e não conseguimos confirmar a marcação. Não voltes a marcar já — liga ao salão para confirmar.',
  };
  if (String(code).startsWith('auth/')) return authErrorMessage(code);
  return map[code] || fallback;
}
export function authErrorMessage(code) {
  const map = {
    'auth/email-already-in-use':   'Este email já está registado.',
    'auth/invalid-email':          'Email inválido.',
    'auth/weak-password':          'Password fraca (mínimo 6 caracteres).',
    'auth/user-not-found':         'Email ou password incorretos.',
    'auth/wrong-password':         'Email ou password incorretos.',
    'auth/invalid-credential':     'Email ou password incorretos.',
    'auth/too-many-requests':      'Demasiadas tentativas. Aguarda alguns minutos.',
    'auth/network-request-failed': 'Sem ligação à internet.',
    'auth/requires-recent-login':  'Por segurança, sai e entra de novo.',
    'auth/popup-closed-by-user':   'Cancelado.',
  };
  return map[code] || 'Ocorreu um erro. Tenta novamente.';
}

/* ── Money / formatting ──────────────────────────────────── */
export const formatPrice = (v) => {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return Number.isInteger(n) ? `${n}€` : `${n.toFixed(2)}€`;
};
export const formatRelativeTime = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)     return 'agora';
  if (s < 3600)   return `há ${Math.floor(s/60)} min`;
  if (s < 86400)  return `há ${Math.floor(s/3600)} h`;
  if (s < 604800) return `há ${Math.floor(s/86400)} d`;
  return formatDatePT(formatDate(d), { short: true });
};

/* ── Status helpers ──────────────────────────────────────── */
export const STATUS_LABELS = {
  pending:    'Pendente',
  confirmed:  'Confirmada',
  completed:  'Concluída',
  cancelled:  'Cancelada',
  noshow:     'Não compareceu',
};
export const STATUS_BADGE_CLS = {
  pending:    'badge--amber',
  confirmed:  'badge--blue',
  completed:  'badge--green',
  cancelled:  'badge--gray',
  noshow:     'badge--red',
};
export function statusBadge(status) {
  const cls = STATUS_BADGE_CLS[status] || 'badge--gray';
  return `<span class="badge ${cls}">${escapeHTML(STATUS_LABELS[status] || status || '—')}</span>`;
}

/* ── Referral codes ──────────────────────────────────────── */
export function generateReferralCode(name, salonId) {
  const prefix = (salonId || 'BK').slice(0, 3).toUpperCase();
  const part   = (name || '').replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'USER';
  const num    = Math.floor(10 + Math.random() * 90);
  return `${prefix}-${part}${num}`;
}

/* ── Debounce / Throttle ─────────────────────────────────── */
export function debounce(fn, wait = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
export function throttle(fn, wait = 200) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= wait) { last = now; fn(...args); }
  };
}

/* ============================================================
   BOOKINGS — atomic helpers
   ------------------------------------------------------------
   Every write that changes *when* something happens goes through a Firestore
   transaction that also touches the per-staff/per-day AGENDA document
   (salons/{id}/agenda/{staffId}__{date} → { intervals:[{start,end,bookingId}] }).
   Transactions serialise on that document, so two people booking the same
   staff member at overlapping times can never both succeed — regardless of
   what the UI showed them. Agenda docs carry no personal data, which is what
   lets the public booking page read availability without exposing clients.

   RULE OF FIRESTORE TRANSACTIONS: all reads before any write.
   ============================================================ */

const agendaRef = (salonId, staffId, dateStr) => doc(db, 'salons', salonId, 'agenda', agendaId(staffId, dateStr));
const linkRef = (salonId, token) => doc(db, 'salons', salonId, 'bookingLinks', token);

function err(code, extra) { const e = new Error(code); e.code = code; Object.assign(e, extra || {}); return e; }

/**
 * bookingLinks/{token} is a PII-free projection of a booking, readable only by
 * whoever holds the unguessable token (capability URL). It powers m.html: the
 * client confirms / cancels / adds to calendar without an account. Kept in sync
 * by every helper that changes status, date, time or staff.
 */
function linkProjection(salonId, bookingId, b) {
  return {
    salonId, bookingId,
    serviceName: b.serviceName, serviceDuration: b.serviceDuration,
    staffId: b.staffId, staffName: b.staffName,
    date: b.date, time: b.time, startMin: b.startMin, endMin: b.endMin,
    status: b.status, updatedAt: serverTimestamp(),
  };
}
function syncLink(tx, salonId, bookingId, b, patch) {
  if (!b?.manageToken) return; // legacy booking without a link
  // merge-set: also (re)creates the projection if it went missing, with the
  // identifying fields the create rule requires and never any PII.
  tx.set(linkRef(salonId, b.manageToken), { salonId, bookingId, ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

/** Load what the booking engine needs for a salon (schedule + active staff). */
export async function loadBookingContext(salonId) {
  const [schedSnap, staffSnap] = await Promise.all([
    getDoc(doc(db, 'salons', salonId, 'config', 'schedule')),
    getDocs(query(collection(db, 'salons', salonId, 'staff'), where('active', '==', true))),
  ]);
  const staff = staffSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  return { schedule: schedSnap.exists() ? schedSnap.data() : null, staff };
}

/** Read the agenda docs for a set of staff on one date → Map(staffId → occupied[]).
 *  `excludeBookingId` drops that booking's own interval (used when rescheduling). */
export async function loadOccupied(salonId, staffIds, dateStr, excludeBookingId = null) {
  const snaps = await Promise.all(staffIds.map(id => getDoc(agendaRef(salonId, id, dateStr))));
  const out = new Map();
  snaps.forEach((s, i) => out.set(staffIds[i], s.exists() ? occupiedFromAgenda(s.data(), excludeBookingId) : []));
  return out;
}

/**
 * Compute bookable start times for a date. Handles "no preference" by
 * unioning every active staff member's free slots.
 * @returns {{ slots: number[], perStaff: Map<string, number[]>, window: object|null }}
 */
export async function computeAvailability({ salonId, salon, ctx, service, services, staff, dateStr, excludeBookingId = null }) {
  const layout = layoutServices(services?.length ? services : [service]);
  if (!(layout.span > 0)) return { slots: [], perStaff: new Map(), window: null };
  const tz = salonSetting(salon, 'timezone');
  const now = nowInTimezone(tz);
  const lead = salonSetting(salon, 'bookingLeadMinutes');
  const interval = salonSetting(salon, 'slotInterval');
  const notBefore = dateStr === now.dateStr ? now.minutes + lead : (dateStr < now.dateStr ? Infinity : null);
  // Only offer people who actually do this work.
  const wanted = (services?.length ? services : [service]).filter(Boolean).map(s => s.id);
  const candidates = (staff ? [staff] : ctx.staff).filter(s => staffCanDo(s, wanted));
  if (!candidates.length) return { slots: [], perStaff: new Map(), window: null };

  const occ = await loadOccupied(salonId, candidates.map(s => s.id), dateStr, excludeBookingId);
  const perStaff = new Map();
  let windowForDisplay = null;
  for (const s of candidates) {
    const window = resolveDayWindow({ salonSchedule: ctx.schedule, staff: s, dateStr, closedDates: salon.closedDates || [] });
    if (window.closed) { perStaff.set(s.id, []); if (!windowForDisplay) windowForDisplay = window; continue; }
    windowForDisplay = window;
    perStaff.set(s.id, generateSlots({ ...window, span: layout.span, busy: layout.busy, interval, occupied: occ.get(s.id) || [], notBefore }));
  }
  const union = [...new Set([...perStaff.values()].flat())].sort((a, b) => a - b);
  return { slots: union, perStaff, window: windowForDisplay };
}

/**
 * Create a booking atomically. If `staff` is null ("no preference"), the first
 * candidate free at that time is assigned — so every booking ends up with a real
 * staff member and the agenda stays consistent.
 */
export async function createBooking({ salonId, salon, ctx, service, services, staff, dateStr, startMin, client, discount, source = 'online', status = 'pending', channel = null, reactivationToken = null }) {
  if (!isValidDateStr(dateStr)) throw err('invalid-date');
  const list = (services?.length ? services : (service ? [service] : [])).filter(s => s && s.id);
  if (!list.length) throw err('invalid-service');
  if (list.length > MAX_SERVICES_PER_BOOKING) throw err('too-many-services');
  const layout = layoutServices(list);
  if (!(layout.span > 0)) throw err('invalid-service');
  const duration = layout.span;
  const tz = salonSetting(salon, 'timezone');
  const now = nowInTimezone(tz);
  const lead = source === 'online' ? salonSetting(salon, 'bookingLeadMinutes') : 0;
  const maxDays = salonSetting(salon, 'maxAdvanceDays');
  if (dateStr < now.dateStr) throw err('too-soon');
  if (source === 'online' && dateStr > addDaysStr(now.dateStr, maxDays)) throw err('outside-hours');
  const notBefore = dateStr === now.dateStr ? now.minutes + lead : null;
  // A booking must land on someone who does this work — otherwise the client
  // turns up for a colour with a barber who has never done one.
  const wantedIds = list.map(s => s.id);
  const candidates = (staff ? [staff] : ctx.staff).filter(s => staffCanDo(s, wantedIds));
  if (!candidates.length) throw err(staff ? 'staff-cannot-do-service' : 'no-staff-available');

  const bookingRef = doc(collection(db, 'salons', salonId, 'bookings'));
  const finalPrice = discount?.percent ? applyDiscount(layout.price, discount.percent) : layout.price;
  const manageToken = randomToken(16);
  const phoneE164 = normalizePhone(client.phone);

  try {
    // A booking that never resolves is the worst outcome for the person on the
    // other side: they cannot tell whether they have an appointment. Cap the
    // wait, and then go and find out.
    return await withTimeout(runCreateTx(), BOOKING_TIMEOUT_MS);
  } catch (e) {
    // Timed out. The write may still be travelling — a request already sent
    // cannot be recalled — so do NOT say it failed until we have looked. The
    // link projection is publicly readable by token, and we minted that token
    // before starting, so it answers the question without needing a login.
    if (e?.code === 'timeout') {
      for (const wait of [1500, 3000, 5000]) {
        await sleep(wait);
        const l = await getDoc(linkRef(salonId, manageToken)).catch(() => null);
        if (l?.exists()) {
          const d = l.data();
          return { id: d.bookingId, staff: candidates.find(s => s.id === d.staffId) || { id: d.staffId, name: d.staffName }, time: d.time, finalPrice, manageToken, slow: true };
        }
      }
      throw err('timeout');
    }
    // Race loser on the PUBLIC path: security rules ("+1 interval only") are
    // evaluated against the winner's fresh state before the version check, so
    // the SDK surfaces permission-denied instead of retrying. Re-read and, if
    // the slot is indeed gone, report it honestly as slot-taken.
    if (e?.code === 'permission-denied' && !auth.currentUser) {
      const occ = await loadOccupied(salonId, candidates.map(s => s.id), dateStr);
      const mine = busyAt(startMin, layout);
      const allBusy = candidates.every(s => (occ.get(s.id) || []).some(o => mine.some(iv => o.start < iv.end && iv.start < o.end)));
      if (allBusy) throw err(staff ? 'slot-taken' : 'no-staff-available');
    }
    throw e;
  }

  async function runCreateTx() { return await runTransaction(db, async (tx) => {
    // ── reads ──
    const snaps = [];
    for (const s of candidates) snaps.push(await tx.get(agendaRef(salonId, s.id, dateStr)));

    // ── pick the first staff member free for [start, start+duration) ──
    let chosen = null, chosenSnap = null; const reasons = [];
    for (let i = 0; i < candidates.length; i++) {
      const s = candidates[i];
      const window = resolveDayWindow({ salonSchedule: ctx.schedule, staff: s, dateStr, closedDates: salon.closedDates || [] });
      const occupied = snaps[i].exists() ? occupiedFromAgenda(snaps[i].data()) : [];
      const reason = checkSlot({ window, span: layout.span, busy: layout.busy, start: startMin, occupied, notBefore });
      if (!reason) { chosen = s; chosenSnap = snaps[i]; break; }
      reasons.push(reason);
    }
    if (!chosen) {
      // Chosen staff → their exact reason. "No preference" → a salon-wide reason
      // only when every candidate shares it; otherwise "nobody is free".
      const allSame = reasons.every(r => r === reasons[0]);
      throw err(staff ? reasons[0] : (allSame && reasons[0] !== 'slot-taken' ? reasons[0] : 'no-staff-available'));
    }

    // ── writes ──
    // `viaBookingId` names the booking this hold belongs to. The rules use it to
    // check the entry really shadows a booking of this staff member on this day —
    // without it, anyone could write blocks for a booking that does not exist.
    const aRef = agendaRef(salonId, chosen.id, dateStr);
    if (chosenSnap.exists()) tx.update(aRef, { [`byBooking.${bookingRef.id}`]: { blocks: busyAt(startMin, layout) }, viaBookingId: bookingRef.id, updatedAt: serverTimestamp() });
    else tx.set(aRef, { staffId: chosen.id, date: dateStr, byBooking: { [bookingRef.id]: { blocks: busyAt(startMin, layout) } }, viaBookingId: bookingRef.id, updatedAt: serverTimestamp() });

    const bookingDoc = {
      salonId,
      clientId: client.id || null,
      clientName: clampStr(client.name, 80), clientEmail: clampStr(client.email, 120).toLowerCase(),
      clientPhone: clampStr(client.phone, 20), clientPhoneE164: phoneE164,
      forSomeone: client.forSomeone ? clampStr(client.forSomeone, 80) : null,
      notes: clampStr(client.notes, 500),
      // Multi-service visit. The summary fields (serviceId/Name/Price/Duration)
      // stay for compatibility: id = first service, price/duration = totals.
      services: list.map(s => ({ id: s.id, name: s.name, price: Number(s.price) || 0, duration: Math.round(Number(s.duration) || 0), segments: normaliseSegments(s) })),
      serviceIds: list.map(s => s.id),
      serviceId: list[0].id,
      serviceName: list.map(s => s.name).join(' + '),
      serviceDuration: duration, servicePrice: layout.price,
      busyBlocks: layout.busy,              // relative to the start; used when rescheduling
      finalPrice,
      discountType: discount?.type || null, discountCode: discount?.code || null,
      referralCode: discount?.type === 'referral' ? discount.code : null,
      referralDiscount: discount?.percent || 0,
      staffId: chosen.id, staffName: chosen.name, staffPreference: staff ? 'chosen' : 'any',
      date: dateStr, time: minToTime(startMin), startMin, endMin: startMin + duration,
      status, paid: false, source, channel: channel ? clampStr(channel, 40) : null,
      // Attribution: set when the client arrived through a reactivation link.
      reactivationToken: reactivationToken ? clampStr(reactivationToken, 64) : null,
      manageToken,
      confirmedAt: status === 'confirmed' ? serverTimestamp() : null, confirmedVia: status === 'confirmed' ? source : null,
      confirmRequestedAt: null, reminderSentAt: null,
      createdAt: serverTimestamp(),
    };
    tx.set(bookingRef, bookingDoc);
    tx.set(linkRef(salonId, manageToken), linkProjection(salonId, bookingRef.id, bookingDoc));
    return { id: bookingRef.id, staff: chosen, time: minToTime(startMin), finalPrice, manageToken };
  }); }
}

/* ── Capability-link flows (no login; the token IS the credential) ── */
export async function loadBookingLink({ salonId, token }) {
  const s = await getDoc(linkRef(salonId, token));
  return s.exists() ? { token, ...s.data() } : null;
}
/** Client confirms from m.html. Rules: token must match, pending → confirmed only. */
export async function confirmBookingByToken({ salonId, token }) {
  const l = await loadBookingLink({ salonId, token });
  if (!l) throw err('booking-not-found');
  if (l.status === 'confirmed') return { alreadyConfirmed: true };
  if (l.status !== 'pending') throw err('invalid-transition');
  const batch = writeBatch(db);
  batch.update(doc(db, 'salons', salonId, 'bookings', l.bookingId), { status: 'confirmed', confirmedAt: serverTimestamp(), confirmedVia: 'link', viaToken: token });
  batch.update(linkRef(salonId, token), { status: 'confirmed', updatedAt: serverTimestamp() });
  await batch.commit();
  return { ok: true };
}
/** Client cancels from m.html within the salon's policy. Frees the agenda atomically. */
export async function cancelBookingByToken({ salonId, salon, token }) {
  const l = await loadBookingLink({ salonId, token });
  if (!l) throw err('booking-not-found');
  if (!BLOCKING_STATUSES.includes(l.status)) throw err('invalid-transition');
  const policy = clientCanCancel({ booking: { status: l.status, date: l.date, time: l.time }, cancellationHours: salonSetting(salon, 'cancellationHours'), now: nowInTimezone(salonSetting(salon, 'timezone')) });
  if (!policy.ok) throw err(policy.reason === 'too-late' ? 'cancel-too-late' : 'invalid-transition');
  const aRef = agendaRef(salonId, l.staffId, l.date);
  return await runTransaction(db, async (tx) => {
    const aSnap = await tx.get(aRef);                 // agenda is public-read; the booking itself is not
    tx.update(doc(db, 'salons', salonId, 'bookings', l.bookingId), { status: 'cancelled', cancelledAt: serverTimestamp(), cancelledBy: 'client-link', viaToken: token });
    // Delete only this booking's own key — the rules enforce exactly that.
    if (aSnap.exists()) tx.update(aRef, { [`byBooking.${l.bookingId}`]: deleteField(), viaToken: token, viaBookingId: l.bookingId, updatedAt: serverTimestamp() });
    tx.update(linkRef(salonId, token), { status: 'cancelled', updatedAt: serverTimestamp() });
    return { ok: true };
  });
}

/* ── WhatsApp (manual, zero cost): message + wa.me link, and tracking ── */
/**
 * Builds the text and wa.me URL for a booking. `kind`: confirmRequest | reminder | reminderToday | freeSlot.
 * Returns null when the booking has no usable phone.
 */
export function whatsAppFor({ salon, booking, kind, baseUrl = APP_BASE_URL }) {
  const link = booking.manageToken ? manageUrl(baseUrl, booking.salonId || salon.id, booking.manageToken) : `${baseUrl}/account.html?salon=${encodeURIComponent(booking.salonId || salon.id)}`;
  const text = messageText(kind, { clientName: booking.clientName, salonName: salon.name, serviceName: booking.serviceName, dateStr: booking.date, time: booking.time, link });
  const url = whatsAppUrl(booking.clientPhoneE164 || booking.clientPhone, text);
  return url ? { text, url } : null;
}
/** Staff/admin pressed "WhatsApp": record it so we can measure confirmation and reminder coverage. */
export async function markMessageSent({ salonId, bookingId, kind }) {
  const field = kind === 'confirmRequest' ? 'confirmRequestedAt' : kind === 'freeSlot' ? 'offerSentAt' : 'reminderSentAt';
  await updateDoc(doc(db, 'salons', salonId, 'bookings', bookingId), { [field]: serverTimestamp(), lastMessageKind: kind });
}

/* ============================================================
   RETENTION — clients at risk, reactivation, attributed recovery
   ============================================================ */

/**
 * Everything the retention panel needs, in two reads: the booking history
 * window (cadence + upcoming appointments) and the log of messages already sent.
 */
export async function loadRetention({ salonId, salon, historyDays = 540 }) {
  const today = todayForSalon(salon);
  const from = addDaysStr(today, -historyDays);
  const [bookSnap, reactSnap] = await Promise.all([
    getDocs(query(collection(db, 'salons', salonId, 'bookings'), where('date', '>=', from))),
    getDocs(collection(db, 'salons', salonId, 'reactivations')),
  ]);
  return {
    today,
    bookings: bookSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    reactivations: reactSnap.docs.map(d => ({ id: d.id, ...d.data() })),
  };
}

/** Booking link that carries the attribution token. */
export function reactivationLink({ salonId, token, baseUrl = APP_BASE_URL }) {
  return `${baseUrl.replace(/\/$/, '')}/?salon=${encodeURIComponent(salonId)}&src=reativacao&rt=${encodeURIComponent(token)}`;
}

/**
 * Record that we contacted (or deliberately skipped) a client. One document per
 * message, so the token is unique and attribution is unambiguous.
 * `kind`: 'sent' | 'dismissed'
 */
export async function logReactivation({ salonId, profile, kind = 'sent', token = randomToken(8), by = 'admin' }) {
  await setDoc(doc(db, 'salons', salonId, 'reactivations', token), {
    clientKey: profile.key,
    clientId: profile.clientId || null,
    clientName: clampStr(profile.name, 80),
    clientPhoneE164: profile.phone || null,
    service: profile.topService || profile.lastService || null,
    lastVisit: profile.lastVisit || null,
    cadenceDays: profile.cadenceDays || null,
    spent12m: profile.spent12m || 0,
    kind, by,
    sentAt: serverTimestamp(),
  });
  return token;
}
export async function deleteReactivation({ salonId, token }) {
  await deleteDoc(doc(db, 'salons', salonId, 'reactivations', token));
}

/* ============================================================
   WAITLIST — who wanted the slot that just opened up
   ============================================================ */

/** Join the queue. Public: the same door as a booking, same identity rule. */
export async function joinWaitlist({ salonId, salon, services, staff, client, fromDate, toDate, partOfDay = 'any' }) {
  const list = (services || []).filter(s => s && s.id);
  if (!list.length) throw err('invalid-service');
  const layout = layoutServices(list);
  const phoneE164 = normalizePhone(client.phone);
  if (!phoneE164) throw err('invalid-phone');
  if (!isValidDateStr(fromDate) || !isValidDateStr(toDate) || fromDate > toDate) throw err('invalid-date');
  const maxDays = salonSetting(salon, 'maxAdvanceDays');
  const today = todayForSalon(salon);
  if (toDate > addDaysStr(today, maxDays)) throw err('outside-hours');

  const ref = doc(collection(db, 'salons', salonId, 'waitlist'));
  await setDoc(ref, {
    salonId,
    name: clampStr(client.name, 80),
    phone: clampStr(client.phone, 30), phoneE164,
    email: clampStr(client.email, 120).toLowerCase(),
    notes: clampStr(client.notes, 300),
    serviceIds: list.map(s => s.id),
    serviceName: clampStr(list.map(s => s.name).join(' + '), 120),
    duration: layout.span, price: layout.price,
    staffId: staff?.id || null, staffName: staff?.name || null,
    fromDate, toDate, partOfDay,
    status: 'waiting',
    createdDate: today,               // a plain date, so the queue can be ordered without a clock
    createdAt: serverTimestamp(),
  });
  return { id: ref.id };
}

/** The whole queue for this salon. Small by nature — a salon is not a call centre. */
export async function loadWaitlist(salonId) {
  const snap = await getDocs(collection(db, 'salons', salonId, 'waitlist'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Record that we offered a freed slot to someone, so we do not do it again tomorrow. */
export async function markWaitlistOffered({ salonId, entryId, slot, today }) {
  await updateDoc(doc(db, 'salons', salonId, 'waitlist', entryId), {
    lastOfferedDate: today,
    lastOfferedFor: { date: slot.date, time: slot.time, staffId: slot.staffId || null },
    offerCount: increment(1),
    updatedAt: serverTimestamp(),
  });
}

/** They took it, gave up, or the salon is tidying the queue. */
export async function setWaitlistStatus({ salonId, entryId, status }) {
  await updateDoc(doc(db, 'salons', salonId, 'waitlist', entryId), { status, updatedAt: serverTimestamp() });
}
export async function removeWaitlistEntry({ salonId, entryId }) {
  await deleteDoc(doc(db, 'salons', salonId, 'waitlist', entryId));
}

/** The slot a cancelled booking leaves behind. */
export function freedSlotFrom(booking) {
  const start = booking.startMin ?? timeToMin(booking.time) ?? 0;
  return {
    date: booking.date, time: booking.time,
    startMin: start, endMin: booking.endMin ?? start + (booking.serviceDuration || 30),
    staffId: booking.staffId, staffName: booking.staffName,
  };
}

/** Booking link that lands the person on the right day, ready to pick the time. */
export function waitlistBookingLink({ salonId, slot, baseUrl = APP_BASE_URL }) {
  return `${baseUrl.replace(/\/$/, '')}/?salon=${encodeURIComponent(salonId)}&src=lista-espera&date=${encodeURIComponent(slot.date)}`;
}

/* ============================================================
   TEAM ACCESS — one login per person, instead of one per salon
   ============================================================ */

/**
 * Who is this signed-in person, for this salon? Decided by the salon's own
 * documents, never by anything the client sends — so the same uid is only
 * staff where the salon says so.
 * @returns {{uid, name, role:'admin'|'team'|'member', staffId?}|null}
 */
export async function resolveActor(salonId, salon, user) {
  if (!user) return null;
  if (salon?.adminUid === user.uid) return { uid: user.uid, name: 'Administração', role: 'admin' };
  const s = await getDoc(doc(db, 'salons', salonId, 'staffAuth', user.uid)).catch(() => null);
  if (s?.exists() && s.data().active !== false) {
    const d = s.data();
    return { uid: user.uid, name: d.name || user.email || 'Colaborador', role: 'member', staffId: d.staffId };
  }
  if (salon?.teamUid === user.uid) return { uid: user.uid, name: 'Equipa', role: 'team' };
  return null;
}

/** Everyone with their own login in this salon, keyed by staffId. */
export async function loadTeamAccess(salonId) {
  const snap = await getDocs(collection(db, 'salons', salonId, 'staffAuth'));
  const byStaffId = new Map();
  for (const d of snap.docs) byStaffId.set(d.data().staffId, { uid: d.id, ...d.data() });
  return byStaffId;
}

/**
 * Give one staff member their own login. Creates a real Firebase account on a
 * SECONDARY auth instance so the owner is not signed out of their own session,
 * then records the uid on both sides: `staffAuth/{uid}` is what the security
 * rules read, `staff/{staffId}.uid` is what the panel shows.
 */
export async function grantStaffAccess({ salonId, staffId, name, email, password }) {
  const mail = clampStr(email, 120).toLowerCase();
  if (!isEmail(mail)) throw err('invalid-email');
  if (!password || password.length < 8) throw err('weak-password');
  const { getSecondaryAuth, createUserWithEmailAndPassword } = await import('./firebase.js');
  const secondary = getSecondaryAuth();
  let uid;
  try {
    uid = (await createUserWithEmailAndPassword(secondary, mail, password)).user.uid;
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') throw err('email-in-use');
    throw e;
  } finally {
    // Never leave the new account signed in on the secondary instance.
    try { const { signOut } = await import('./firebase.js'); await signOut(secondary); } catch {}
  }
  await setDoc(doc(db, 'salons', salonId, 'staffAuth', uid), {
    staffId, name: clampStr(name, 80), email: mail, active: true, createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'salons', salonId, 'staff', staffId), { uid, email: mail });
  return { uid, email: mail };
}

/** Take someone's access away — they can no longer sign in to this salon. */
export async function revokeStaffAccess({ salonId, staffId, uid }) {
  await deleteDoc(doc(db, 'salons', salonId, 'staffAuth', uid));
  await updateDoc(doc(db, 'salons', salonId, 'staff', staffId), { uid: null }).catch(() => {});
}

/** Suspend or restore access without destroying the account. */
export async function setStaffAccessActive({ salonId, uid, active }) {
  await updateDoc(doc(db, 'salons', salonId, 'staffAuth', uid), { active: !!active });
}

/* ============================================================
   IMPORT — bringing a salon's history in from its old software
   ============================================================ */

/** Everything the import screen needs to match against what already exists. */
export async function loadImportContext(salonId) {
  const [cSnap, sSnap] = await Promise.all([
    getDocs(collection(db, 'salons', salonId, 'clients')),
    getDocs(collection(db, 'salons', salonId, 'services')),
  ]);
  return {
    clients: cSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    services: sSnap.docs.map(d => ({ id: d.id, ...d.data() })),
  };
}

/**
 * Write the analysed rows. Clients are merged (never duplicated); visits are
 * written with a deterministic id so re-importing the same file updates instead
 * of duplicating. Past visits do NOT touch the agenda — they are history.
 *
 * @param {function} onProgress (done, total)
 * @returns {{ clientsCreated, clientsUpdated, visitsWritten, failed:[{line,error}] }}
 */
export async function runImport({ salonId, analysis, defaultStaff = null, onProgress = null }) {
  const usable = analysis.rows.filter(r => r.ok);
  const result = { clientsCreated: 0, clientsUpdated: 0, visitsWritten: 0, failed: [] };
  const clientIdByKey = new Map();
  for (const r of usable) if (r.existingClientId) clientIdByKey.set(r.key, r.existingClientId);

  // 1) one client document per distinct person in the file
  const firstByKey = new Map();
  for (const r of usable) if (!firstByKey.has(r.key)) firstByKey.set(r.key, r);

  let done = 0;
  const total = firstByKey.size + (analysis.kind === 'visits' ? usable.length : 0);
  for (const [key, r] of firstByKey) {
    const base = {
      name: r.client.name || 'Cliente',
      phone: r.client.phone || '', phoneE164: r.client.phoneE164 || null,
      email: r.client.email || '',
      birthday: r.client.birthday || null,
    };
    try {
      if (r.existingClientId) {
        // Never overwrite what the salon already has with blanks.
        const patch = Object.fromEntries(Object.entries(base).filter(([, v]) => v !== '' && v != null));
        await updateDoc(doc(db, 'salons', salonId, 'clients', r.existingClientId), { ...patch, updatedAt: serverTimestamp() });
        result.clientsUpdated++;
      } else {
        const ref = doc(collection(db, 'salons', salonId, 'clients'));
        await setDoc(ref, {
          ...base, uid: null, referralCode: null,
          visits: 0, points: 0, totalSpent: 0, referredBy: null, referrals: [], discounts: [],
          source: 'import', importedAt: serverTimestamp(), createdAt: serverTimestamp(),
        });
        clientIdByKey.set(key, ref.id);
        result.clientsCreated++;
      }
    } catch (e) { result.failed.push({ line: r.line, error: e.code || e.message }); }
    if (onProgress) onProgress(++done, total);
  }

  if (analysis.kind !== 'visits') return result;

  // 2) the visits themselves, plus the loyalty counters they imply
  const tally = new Map();   // clientId → { visits, spent, last }
  for (const r of usable) {
    const clientId = clientIdByKey.get(r.key) || null;
    const v = r.visit;
    try {
      await setDoc(doc(db, 'salons', salonId, 'bookings', r.docId), {
        salonId, imported: true, source: 'import',
        clientId, clientName: r.client.name || 'Cliente', clientEmail: r.client.email || '',
        clientPhone: r.client.phone || '', clientPhoneE164: r.client.phoneE164 || null,
        serviceIds: v.serviceId ? [v.serviceId] : [], serviceId: v.serviceId || '',
        serviceName: v.serviceName, serviceDuration: v.duration, servicePrice: v.price, finalPrice: v.price,
        staffId: defaultStaff?.id || 'importado', staffName: v.staffName || defaultStaff?.name || 'Importado',
        date: v.date, time: v.time, startMin: v.startMin, endMin: v.endMin,
        status: 'completed', paid: true, paidAt: null, paymentMethod: 'importado',
        manageToken: null, createdAt: serverTimestamp(),
      });
      result.visitsWritten++;
      if (clientId) {
        const t = tally.get(clientId) || { visits: 0, spent: 0, last: '' };
        t.visits++; t.spent += v.price; if (v.date > t.last) t.last = v.date;
        tally.set(clientId, t);
      }
    } catch (e) { result.failed.push({ line: r.line, error: e.code || e.message }); }
    if (onProgress) onProgress(++done, total);
  }

  // 3) counters, so loyalty and "clients at risk" reflect the real history
  for (const [clientId, t] of tally) {
    try {
      await updateDoc(doc(db, 'salons', salonId, 'clients', clientId), {
        visits: t.visits, totalSpent: Math.round(t.spent * 100) / 100, lastVisitDate: t.last, updatedAt: serverTimestamp(),
      });
    } catch (e) { result.failed.push({ line: 0, error: `contadores: ${e.code || e.message}` }); }
  }
  return result;
}

/** Remove a booking from its agenda doc (inside a transaction). */
function releaseInterval(tx, aSnap, aRef, bookingId) {
  if (!aSnap.exists()) return;
  const d = aSnap.data();
  // `viaBookingId` tells the security rules WHICH booking is being freed, so a
  // client cancelling their own appointment can be allowed without giving anyone
  // the power to touch the rest of the day.
  if (d.byBooking && bookingId in d.byBooking) tx.update(aRef, { [`byBooking.${bookingId}`]: deleteField(), viaBookingId: bookingId, updatedAt: serverTimestamp() });
  else if (Array.isArray(d.intervals)) tx.update(aRef, { intervals: d.intervals.filter(iv => iv.bookingId !== bookingId), viaBookingId: bookingId, updatedAt: serverTimestamp() }); // legacy doc
}
/** Write a booking's busy blocks into an agenda doc (creating it if needed). */
function holdInterval(tx, aSnap, aRef, { staffId, date, bookingId, blocks }) {
  if (aSnap.exists()) tx.update(aRef, { [`byBooking.${bookingId}`]: { blocks }, viaBookingId: bookingId, updatedAt: serverTimestamp() });
  else tx.set(aRef, { staffId, date, byBooking: { [bookingId]: { blocks } }, viaBookingId: bookingId, updatedAt: serverTimestamp() });
}
/** The busy blocks of an existing booking, relative to its start (legacy-safe). */
function bookingLayout(b) {
  const start = b.startMin ?? timeToMin(b.time) ?? 0;
  const span = (b.endMin != null ? b.endMin - start : null) ?? b.serviceDuration ?? 30;
  const busy = Array.isArray(b.busyBlocks) && b.busyBlocks.length ? b.busyBlocks : [{ start: 0, end: span }];
  return { start, span, busy };
}

/** Cancel (admin/team/client). Frees the slot atomically. */
export async function cancelBooking({ salonId, bookingId, by = 'salon', enforcePolicy = null }) {
  const bRef = doc(db, 'salons', salonId, 'bookings', bookingId);
  return await runTransaction(db, async (tx) => {
    const bSnap = await tx.get(bRef);
    if (!bSnap.exists()) throw err('booking-not-found');
    const b = bSnap.data();
    if (!canTransition(b.status, 'cancelled')) throw err('invalid-transition');
    if (enforcePolicy) {
      const r = clientCanCancel({ booking: b, cancellationHours: enforcePolicy.cancellationHours, now: enforcePolicy.now });
      if (!r.ok) throw err(r.reason === 'too-late' ? 'cancel-too-late' : 'invalid-transition');
    }
    const aRef = b.staffId ? agendaRef(salonId, b.staffId, b.date) : null;
    const aSnap = aRef ? await tx.get(aRef) : null;
    // writes
    tx.update(bRef, { status: 'cancelled', previousStatus: b.status, cancelledAt: serverTimestamp(), cancelledBy: by, ...stampedBy('cancelled') });
    if (aRef) releaseInterval(tx, aSnap, aRef, bookingId);
    syncLink(tx, salonId, bookingId, b, { status: 'cancelled' });
    return { ok: true, previousStatus: b.status };
  });
}

/** Undo a cancellation. Re-checks the agenda — fails if the slot was taken meanwhile. */
export async function restoreBooking({ salonId, bookingId, toStatus = null }) {
  const bRef = doc(db, 'salons', salonId, 'bookings', bookingId);
  return await runTransaction(db, async (tx) => {
    const bSnap = await tx.get(bRef);
    if (!bSnap.exists()) throw err('booking-not-found');
    const b = bSnap.data();
    const target = toStatus || b.previousStatus || 'pending';
    if (b.status !== 'cancelled' || !canTransition('cancelled', target)) throw err('invalid-transition');
    const { start, busy } = bookingLayout(b);
    const mine = busyAt(start, { busy });
    const aRef = agendaRef(salonId, b.staffId, b.date);
    const aSnap = await tx.get(aRef);
    const occupied = aSnap.exists() ? occupiedFromAgenda(aSnap.data(), bookingId) : [];
    if (occupied.some(o => mine.some(iv => o.start < iv.end && iv.start < o.end))) throw err('slot-taken');
    holdInterval(tx, aSnap, aRef, { staffId: b.staffId, date: b.date, bookingId, blocks: mine });
    tx.update(bRef, { status: target, cancelledAt: null, cancelledBy: null, previousStatus: null, restoredAt: serverTimestamp() });
    syncLink(tx, salonId, bookingId, b, { status: target });
    return { ok: true, status: target };
  });
}

/** Move a booking to a new date/time (and optionally staff). Atomic across both agenda docs. */
export async function rescheduleBooking({ salonId, salon, ctx, bookingId, newDate, newStartMin, newStaff = null }) {
  if (!isValidDateStr(newDate)) throw err('invalid-date');
  const bRef = doc(db, 'salons', salonId, 'bookings', bookingId);
  return await runTransaction(db, async (tx) => {
    const bSnap = await tx.get(bRef);
    if (!bSnap.exists()) throw err('booking-not-found');
    const b = bSnap.data();
    if (!BLOCKING_STATUSES.includes(b.status)) throw err('invalid-transition');
    const { span, busy } = bookingLayout(b);
    const duration = span;
    const staff = newStaff || ctx.staff.find(s => s.id === b.staffId) || { id: b.staffId, name: b.staffName };
    const oldRef = agendaRef(salonId, b.staffId, b.date);
    const newRef = agendaRef(salonId, staff.id, newDate);
    const same = oldRef.path === newRef.path;
    const oldSnap = await tx.get(oldRef);
    const newSnap = same ? oldSnap : await tx.get(newRef);

    const window = resolveDayWindow({ salonSchedule: ctx.schedule, staff, dateStr: newDate, closedDates: salon.closedDates || [] });
    const occupied = newSnap.exists() ? occupiedFromAgenda(newSnap.data(), bookingId) : [];
    const reason = checkSlot({ window, span, busy, start: newStartMin, occupied, notBefore: null });
    if (reason) throw err(reason);

    const blocks = busyAt(newStartMin, { busy });
    if (same) {
      holdInterval(tx, oldSnap, oldRef, { staffId: staff.id, date: newDate, bookingId, blocks });
    } else {
      releaseInterval(tx, oldSnap, oldRef, bookingId);
      holdInterval(tx, newSnap, newRef, { staffId: staff.id, date: newDate, bookingId, blocks });
    }
    // A moved appointment is no longer the one the client agreed to, so the
    // confirmation is dropped and any reminder already sent is cleared. The
    // caller is expected to tell the client — see `whatsAppFor(kind:'rescheduled')`.
    tx.update(bRef, {
      date: newDate, time: minToTime(newStartMin), startMin: newStartMin, endMin: newStartMin + duration,
      staffId: staff.id, staffName: staff.name,
      rescheduledFrom: { date: b.date, time: b.time, staffId: b.staffId }, rescheduledAt: serverTimestamp(),
      status: 'pending', confirmedAt: null, confirmedVia: null,
      confirmRequestedAt: null, reminderSentAt: null, clientNotifiedAt: null,
      ...stampedBy('rescheduled'),
    });
    syncLink(tx, salonId, bookingId, b, { date: newDate, time: minToTime(newStartMin), startMin: newStartMin, endMin: newStartMin + duration, staffId: staff.id, staffName: staff.name });
    return { ok: true };
  });
}

/** pending → confirmed, with transition check. */
export async function confirmBooking({ salonId, bookingId }) {
  const bRef = doc(db, 'salons', salonId, 'bookings', bookingId);
  return await runTransaction(db, async (tx) => {
    const bSnap = await tx.get(bRef);
    if (!bSnap.exists()) throw err('booking-not-found');
    if (!canTransition(bSnap.data().status, 'confirmed')) throw err('invalid-transition');
    tx.update(bRef, { status: 'confirmed', confirmedAt: serverTimestamp(), confirmedVia: 'staff', ...stampedBy('confirmed') });
    syncLink(tx, salonId, bookingId, bSnap.data(), { status: 'confirmed' });
    return { ok: true };
  });
}

/**
 * Find (by email) or prepare a client record for a guest booking being paid.
 * Runs OUTSIDE the transaction (queries aren't allowed inside), by admin/team
 * who have read access. Returns a doc ref + whether it must be created.
 */
async function resolveClientForBooking(salonId, b) {
  if (b.clientId) return { ref: doc(db, 'salons', salonId, 'clients', b.clientId), create: false };
  // Phone first (Portugal: the phone is the identity), then email.
  const phone = b.clientPhoneE164 || normalizePhone(b.clientPhone);
  if (phone) {
    const qp = await getDocs(query(collection(db, 'salons', salonId, 'clients'), where('phoneE164', '==', phone), limit(1)));
    if (!qp.empty) return { ref: qp.docs[0].ref, create: false };
  }
  const email = (b.clientEmail || '').toLowerCase();
  if (email) {
    const q = await getDocs(query(collection(db, 'salons', salonId, 'clients'), where('email', '==', email), limit(1)));
    if (!q.empty) return { ref: q.docs[0].ref, create: false };
  }
  if (!phone && !email) return null;
  return { ref: doc(collection(db, 'salons', salonId, 'clients')), create: true, seed: { name: b.clientName, email, phone: b.clientPhone || '' } };
}

/** Mark paid + completed, award points, mint loyalty coupon when the target is hit. Atomic. */
export async function markBookingPaid({ salonId, salon, bookingId, method }) {
  const bRef = doc(db, 'salons', salonId, 'bookings', bookingId);
  const pre = await getDoc(bRef);
  if (!pre.exists()) throw err('booking-not-found');
  const clientPlan = await resolveClientForBooking(salonId, pre.data());
  const pts = salonSetting(salon, 'pointsPerVisit');
  const target = salonSetting(salon, 'loyaltyVisits');
  const discount = salonSetting(salon, 'loyaltyDiscount');

  return await runTransaction(db, async (tx) => {
    const bSnap = await tx.get(bRef);
    if (!bSnap.exists()) throw err('booking-not-found');
    const b = bSnap.data();
    if (b.paid) return { alreadyPaid: true };
    if (!canTransition(b.status, 'completed')) throw err(b.status === 'cancelled' ? 'booking-cancelled' : b.status === 'noshow' ? 'booking-noshow' : 'invalid-transition');
    const cSnap = clientPlan && !clientPlan.create ? await tx.get(clientPlan.ref) : null;

    tx.update(bRef, {
      paid: true, status: 'completed', paidAt: serverTimestamp(), paymentMethod: method || 'balcao', pointsAwarded: pts,
      ...stampedBy('paid'),
      ...(clientPlan && !b.clientId ? { clientId: clientPlan.ref.id } : {}),
    });
    syncLink(tx, salonId, bookingId, b, { status: 'completed' });

    const spentDelta = Number(b.finalPrice) || Number(b.servicePrice) || 0;
    if (clientPlan?.create) {
      tx.set(clientPlan.ref, {
        ...clientPlan.seed, phoneE164: normalizePhone(clientPlan.seed.phone) || null, uid: null, birthday: null, referralCode: null,
        visits: 1, points: pts, totalSpent: spentDelta, referredBy: null, referrals: [], discounts: [],
        source: 'guest', createdAt: serverTimestamp(),
      });
    } else if (cSnap?.exists()) {
      const c = cSnap.data();
      const visits = (c.visits || 0) + 1;
      const updates = { visits, points: (c.points || 0) + pts, totalSpent: (c.totalSpent || 0) + spentDelta, lastVisitAt: serverTimestamp() };
      if (target > 0 && visits % target === 0) {
        updates.discounts = [...(c.discounts || []), {
          type: 'loyalty', title: '⭐ Desconto de Fidelização',
          description: `${discount}% — ${visits} visitas atingidas`,
          code: `LOYAL${visits}-${(c.referralCode || '').split('-')[1] || Math.floor(100 + Math.random() * 899)}`,
          discount, expiresAt: null, used: false, createdAt: new Date().toISOString(),
        }];
      }
      tx.update(clientPlan.ref, updates);
    }
    return { ok: true };
  });
}

/** No-show + penalty. Atomic. The slot is in the past, so the agenda is left as-is. */
export async function markBookingNoShow({ salonId, salon, bookingId }) {
  const bRef = doc(db, 'salons', salonId, 'bookings', bookingId);
  const penalty = salonSetting(salon, 'noShowPenalty');
  return await runTransaction(db, async (tx) => {
    const bSnap = await tx.get(bRef);
    if (!bSnap.exists()) throw err('booking-not-found');
    const b = bSnap.data();
    if (b.status === 'noshow') return { alreadyNoShow: true };
    if (!canTransition(b.status, 'noshow')) throw err(b.status === 'completed' ? 'booking-completed' : 'booking-cancelled');
    tx.update(bRef, { status: 'noshow', noShowAt: serverTimestamp(), ...stampedBy('noShow') });
    if (b.clientId && penalty > 0) tx.update(doc(db, 'salons', salonId, 'clients', b.clientId), { points: increment(-penalty) });
    syncLink(tx, salonId, bookingId, b, { status: 'noshow' });
    return { ok: true };
  });
}

/* ── Connectivity banner ─────────────────────────────────── */
function connectivityBanner() {
  let el = null;
  const show = () => {
    if (el) return;
    el = document.createElement('div');
    el.id = 'offlineBanner';
    el.setAttribute('role', 'status');
    el.textContent = 'Sem ligação à internet. As alterações vão falhar até a ligação voltar.';
    document.body.appendChild(el);
  };
  const hide = () => { if (el) { el.remove(); el = null; } };
  window.addEventListener('offline', show);
  window.addEventListener('online', hide);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) show();
}
if (typeof window !== 'undefined') connectivityBanner();

/* ── Theme (light/dark) ──────────────────────────────────── */
/* Default: LIGHT. We deliberately do NOT honour prefers-color-scheme on first
 * visit because the booking experience is meant to feel bright and inviting,
 * not "system mode" by accident. User can toggle and choice is persisted. */
const THEME_KEY = 'bookit:theme';
export function getTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; }
}
export function setTheme(theme) {
  if (!HAS_DOM) return;
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}
export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}
// Apply on every page load
if (HAS_DOM) setTheme(getTheme());

/* ── Render booking row (shared component) ───────────────── */
export function renderBookingRow(b, ctx = {}) {
  const { showDate = false, today = todayISO(), actions = '' } = ctx;
  const isToday = b.date === today;
  return htmlMix`
    <div class="row-card ${raw(isToday && showDate ? 'row-card--accent' : '')}">
      <div class="row-card__main">
        <div class="row-card__title">
          ${raw(showDate ? `<span class="row-card__date">${escapeHTML(relativeDay(b.date))}</span>` : '')}
          <strong>${b.time}</strong>
          <span class="row-card__dot" aria-hidden="true">·</span>
          <span>${b.serviceName}</span>
          ${b.forSomeone ? raw(htmlMix`<span class="row-card__for"> (para ${b.forSomeone})</span>`) : ''}
        </div>
        <div class="row-card__meta">
          ${b.clientName}${b.clientPhone ? raw(htmlMix` · <span class="row-card__phone">${b.clientPhone}</span>`) : ''}${b.staffName && b.staffName !== 'Sem preferência' ? raw(htmlMix` · ${b.staffName}`) : ''}
        </div>
        ${b.notes ? raw(htmlMix`<div class="row-card__notes"><span aria-hidden="true">💬</span> ${b.notes}</div>`) : ''}
      </div>
      <div class="row-card__side">
        <div class="row-card__price">${formatPrice(b.finalPrice ?? b.servicePrice)}</div>
        <div class="row-card__badges">
          ${raw(statusBadge(b.status))}
          ${raw(b.paid ? '<span class="badge badge--green">Pago</span>' : '')}
        </div>
        ${actions ? raw(`<div class="row-card__actions">${actions}</div>`) : ''}
      </div>
    </div>`;
}

/* ── CSV export ──────────────────────────────────────────── */
export function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── Real-time subscribe wrapper ─────────────────────────── */
export function subscribe(query, callback, onError) {
  return onSnapshot(query, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => {
    console.error('subscribe', err);
    if (onError) onError(err);
  });
}

/* ── Submission lock (prevent double-submit) ────────────── */
const locks = new Set();
export function withLock(key, fn) {
  return async (...args) => {
    if (locks.has(key)) return;
    locks.add(key);
    try { return await fn(...args); }
    finally { locks.delete(key); }
  };
}

/* ── Focus trap (modals) ─────────────────────────────────── */
export function trapFocus(container) {
  const focusable = container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return () => {};
  const first = focusable[0], last = focusable[focusable.length - 1];
  function handle(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  container.addEventListener('keydown', handle);
  first.focus();
  return () => container.removeEventListener('keydown', handle);
}

/* ── Number formatter ────────────────────────────────────── */
export const fmtNumber = (n) => new Intl.NumberFormat('pt-PT').format(n);
