/* ============================================================
   Book It — Shared utilities (app.js)
   ============================================================ */

import {
  db, auth, doc, getDoc, getDocs, collection, query, where, limit, increment, serverTimestamp,
  runTransaction, onSnapshot, updateDoc, writeBatch
} from './firebase.js';
import {
  timeToMin, minToTime, isValidDateStr, nowInTimezone, resolveDayWindow, generateSlots, checkSlot,
  canTransition, clientCanCancel, BLOCKING_STATUSES, occupiedFromAgenda, agendaId,
  isEmail, isPhone, isHexColor, isSlug, clampStr, validateBookingInput, applyDiscount,
  buildICS, googleCalendarUrl, addDaysStr, weekdayOf, WEEKDAY_KEYS as CORE_WEEKDAY_KEYS,
  normalizePhone, formatPhonePT, randomToken, manageUrl, whatsAppUrl, firstName, dateLabelPT, messageText,
} from './booking-core.js';

// Re-export the pure core so pages import everything from one place.
export {
  timeToMin, minToTime, isValidDateStr, nowInTimezone, resolveDayWindow, generateSlots, checkSlot,
  canTransition, clientCanCancel, BLOCKING_STATUSES, occupiedFromAgenda, agendaId,
  isEmail, isPhone, isHexColor, isSlug, clampStr, validateBookingInput, applyDiscount,
  buildICS, googleCalendarUrl, addDaysStr, weekdayOf,
  normalizePhone, formatPhonePT, randomToken, manageUrl, whatsAppUrl, firstName, dateLabelPT, messageText,
};

/** Public origin of the app (for links sent to clients). */
export const APP_BASE_URL = (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.startsWith('file:'))
  ? window.location.origin : 'https://bookit-51575.web.app';

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

export function toast(msg, opts = {}) {
  const t = ensureToast();
  const kind = typeof opts === 'string' ? opts : (opts.kind || '');
  const undo = (typeof opts === 'object' && opts.undo) || null;
  toastUndoFn = undo;

  t.className = '';
  if (kind) t.classList.add(`toast--${kind}`);
  t.innerHTML = '';

  const msgEl = document.createElement('span');
  msgEl.className = 'toast__msg';
  msgEl.textContent = msg;
  t.appendChild(msgEl);

  if (undo) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast__action';
    btn.textContent = 'Anular';
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
  }, undo ? 6000 : 3000);
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
export async function computeAvailability({ salonId, salon, ctx, service, staff, dateStr, excludeBookingId = null }) {
  const tz = salonSetting(salon, 'timezone');
  const now = nowInTimezone(tz);
  const lead = salonSetting(salon, 'bookingLeadMinutes');
  const interval = salonSetting(salon, 'slotInterval');
  const notBefore = dateStr === now.dateStr ? now.minutes + lead : (dateStr < now.dateStr ? Infinity : null);
  const candidates = staff ? [staff] : ctx.staff;
  if (!candidates.length) return { slots: [], perStaff: new Map(), window: null };

  const occ = await loadOccupied(salonId, candidates.map(s => s.id), dateStr, excludeBookingId);
  const perStaff = new Map();
  let windowForDisplay = null;
  for (const s of candidates) {
    const window = resolveDayWindow({ salonSchedule: ctx.schedule, staff: s, dateStr, closedDates: salon.closedDates || [] });
    if (window.closed) { perStaff.set(s.id, []); if (!windowForDisplay) windowForDisplay = window; continue; }
    windowForDisplay = window;
    perStaff.set(s.id, generateSlots({ ...window, duration: service.duration, interval, occupied: occ.get(s.id) || [], notBefore }));
  }
  const union = [...new Set([...perStaff.values()].flat())].sort((a, b) => a - b);
  return { slots: union, perStaff, window: windowForDisplay };
}

/**
 * Create a booking atomically. If `staff` is null ("no preference"), the first
 * candidate free at that time is assigned — so every booking ends up with a real
 * staff member and the agenda stays consistent.
 */
export async function createBooking({ salonId, salon, ctx, service, staff, dateStr, startMin, client, discount, source = 'online', status = 'pending', channel = null }) {
  if (!isValidDateStr(dateStr)) throw err('invalid-date');
  if (!(service && service.id && service.duration > 0)) throw err('invalid-service');
  const duration = Number(service.duration);
  const tz = salonSetting(salon, 'timezone');
  const now = nowInTimezone(tz);
  const lead = source === 'online' ? salonSetting(salon, 'bookingLeadMinutes') : 0;
  const maxDays = salonSetting(salon, 'maxAdvanceDays');
  if (dateStr < now.dateStr) throw err('too-soon');
  if (source === 'online' && dateStr > addDaysStr(now.dateStr, maxDays)) throw err('outside-hours');
  const notBefore = dateStr === now.dateStr ? now.minutes + lead : null;
  const candidates = staff ? [staff] : ctx.staff;
  if (!candidates.length) throw err('no-staff-available');

  const bookingRef = doc(collection(db, 'salons', salonId, 'bookings'));
  const finalPrice = discount?.percent ? applyDiscount(service.price, discount.percent) : Number(service.price);
  const manageToken = randomToken(16);
  const phoneE164 = normalizePhone(client.phone);

  try {
    return await runCreateTx();
  } catch (e) {
    // Race loser on the PUBLIC path: security rules ("+1 interval only") are
    // evaluated against the winner's fresh state before the version check, so
    // the SDK surfaces permission-denied instead of retrying. Re-read and, if
    // the slot is indeed gone, report it honestly as slot-taken.
    if (e?.code === 'permission-denied' && !auth.currentUser) {
      const occ = await loadOccupied(salonId, candidates.map(s => s.id), dateStr);
      const iv = { start: startMin, end: startMin + duration };
      const allBusy = candidates.every(s => (occ.get(s.id) || []).some(o => o.start < iv.end && iv.start < o.end));
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
      const reason = checkSlot({ window, duration, start: startMin, occupied, notBefore });
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
    const interval = { start: startMin, end: startMin + duration, bookingId: bookingRef.id };
    const aRef = agendaRef(salonId, chosen.id, dateStr);
    if (chosenSnap.exists()) tx.update(aRef, { intervals: [...(chosenSnap.data().intervals || []), interval], updatedAt: serverTimestamp() });
    else tx.set(aRef, { staffId: chosen.id, date: dateStr, intervals: [interval], updatedAt: serverTimestamp() });

    const bookingDoc = {
      salonId,
      clientId: client.id || null,
      clientName: clampStr(client.name, 80), clientEmail: clampStr(client.email, 120).toLowerCase(),
      clientPhone: clampStr(client.phone, 20), clientPhoneE164: phoneE164,
      forSomeone: client.forSomeone ? clampStr(client.forSomeone, 80) : null,
      notes: clampStr(client.notes, 500),
      serviceId: service.id, serviceName: service.name, serviceDuration: duration, servicePrice: Number(service.price),
      finalPrice,
      discountType: discount?.type || null, discountCode: discount?.code || null,
      referralCode: discount?.type === 'referral' ? discount.code : null,
      referralDiscount: discount?.percent || 0,
      staffId: chosen.id, staffName: chosen.name, staffPreference: staff ? 'chosen' : 'any',
      date: dateStr, time: minToTime(startMin), startMin, endMin: startMin + duration,
      status, paid: false, source, channel: channel ? clampStr(channel, 40) : null,
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
    const intervals = (aSnap.exists() ? aSnap.data().intervals || [] : []).filter(iv => iv.bookingId !== l.bookingId);
    tx.update(doc(db, 'salons', salonId, 'bookings', l.bookingId), { status: 'cancelled', cancelledAt: serverTimestamp(), cancelledBy: 'client-link', viaToken: token });
    if (aSnap.exists()) tx.update(aRef, { intervals, viaToken: token, viaBookingId: l.bookingId, updatedAt: serverTimestamp() });
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

/** Remove a booking's interval from its agenda doc (inside a transaction). */
function releaseInterval(tx, aSnap, aRef, bookingId) {
  if (!aSnap.exists()) return;
  const intervals = (aSnap.data().intervals || []).filter(iv => iv.bookingId !== bookingId);
  tx.update(aRef, { intervals, updatedAt: serverTimestamp() });
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
    tx.update(bRef, { status: 'cancelled', previousStatus: b.status, cancelledAt: serverTimestamp(), cancelledBy: by });
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
    const start = b.startMin ?? timeToMin(b.time), end = b.endMin ?? (start + (b.serviceDuration || 30));
    const aRef = agendaRef(salonId, b.staffId, b.date);
    const aSnap = await tx.get(aRef);
    const occupied = aSnap.exists() ? occupiedFromAgenda(aSnap.data(), bookingId) : [];
    if (occupied.some(o => o.start < end && start < o.end)) throw err('slot-taken');
    const interval = { start, end, bookingId };
    if (aSnap.exists()) tx.update(aRef, { intervals: [...(aSnap.data().intervals || []).filter(i => i.bookingId !== bookingId), interval], updatedAt: serverTimestamp() });
    else tx.set(aRef, { staffId: b.staffId, date: b.date, intervals: [interval], updatedAt: serverTimestamp() });
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
    const duration = b.serviceDuration || 30;
    const staff = newStaff || ctx.staff.find(s => s.id === b.staffId) || { id: b.staffId, name: b.staffName };
    const oldRef = agendaRef(salonId, b.staffId, b.date);
    const newRef = agendaRef(salonId, staff.id, newDate);
    const same = oldRef.path === newRef.path;
    const oldSnap = await tx.get(oldRef);
    const newSnap = same ? oldSnap : await tx.get(newRef);

    const window = resolveDayWindow({ salonSchedule: ctx.schedule, staff, dateStr: newDate, closedDates: salon.closedDates || [] });
    const occupied = newSnap.exists() ? occupiedFromAgenda(newSnap.data(), bookingId) : [];
    const reason = checkSlot({ window, duration, start: newStartMin, occupied, notBefore: null });
    if (reason) throw err(reason);

    const interval = { start: newStartMin, end: newStartMin + duration, bookingId };
    if (same) {
      const rest = (oldSnap.exists() ? oldSnap.data().intervals || [] : []).filter(i => i.bookingId !== bookingId);
      if (oldSnap.exists()) tx.update(oldRef, { intervals: [...rest, interval], updatedAt: serverTimestamp() });
      else tx.set(oldRef, { staffId: staff.id, date: newDate, intervals: [interval], updatedAt: serverTimestamp() });
    } else {
      releaseInterval(tx, oldSnap, oldRef, bookingId);
      if (newSnap.exists()) tx.update(newRef, { intervals: [...(newSnap.data().intervals || []), interval], updatedAt: serverTimestamp() });
      else tx.set(newRef, { staffId: staff.id, date: newDate, intervals: [interval], updatedAt: serverTimestamp() });
    }
    tx.update(bRef, {
      date: newDate, time: minToTime(newStartMin), startMin: newStartMin, endMin: newStartMin + duration,
      staffId: staff.id, staffName: staff.name,
      rescheduledFrom: { date: b.date, time: b.time, staffId: b.staffId }, rescheduledAt: serverTimestamp(),
      // a moved appointment must be re-confirmed by the client
      ...(b.status === 'confirmed' && b.confirmedVia === 'link' ? {} : {}),
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
    tx.update(bRef, { status: 'confirmed', confirmedAt: serverTimestamp(), confirmedVia: 'staff' });
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
    tx.update(bRef, { status: 'noshow', noShowAt: serverTimestamp() });
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
