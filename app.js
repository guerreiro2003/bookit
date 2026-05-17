/* ============================================================
   Book It — Shared utilities (app.js)
   ============================================================ */

import {
  db, doc, getDoc, updateDoc, increment, serverTimestamp,
  runTransaction, onSnapshot
} from './firebase.js';

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

/* ── Validation ──────────────────────────────────────────── */
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
export const isPhone = (v) => {
  const digits = String(v).replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15;
};
export const isHexColor = (v) => /^#[0-9A-Fa-f]{6}$/.test(v);
export const isSlug = (v) => /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(v);

/* ── Firebase error mapping ──────────────────────────────── */
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

/* ── Password hashing (SHA-256) ──────────────────────────── */
export async function hashPassword(pw) {
  const enc = new TextEncoder().encode(String(pw));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function verifyPassword(pw, hash) {
  if (!hash) return false;
  // Legacy plain-text fallback (will be re-hashed on next save)
  if (!/^[a-f0-9]{64}$/.test(String(hash))) return pw === hash;
  const h = await hashPassword(pw);
  // constant-time-ish compare
  if (h.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
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

/* ── Bookings: atomic helpers ────────────────────────────── */
/** Mark a booking paid + completed + award points + create loyalty discount if reached. Atomic.
 *  CRITICAL: Firestore transactions require ALL reads before ANY writes.
 *  Bug found 2026-05-17 via E2E — never reorder these. */
export async function markBookingPaid({ salonId, bookingId, method, pointsPerVisit, loyaltyVisits, loyaltyDiscount }) {
  const bRef = doc(db, 'salons', salonId, 'bookings', bookingId);
  return await runTransaction(db, async (tx) => {
    // ── ALL READS FIRST ──
    const bSnap = await tx.get(bRef);
    if (!bSnap.exists()) throw new Error('booking-not-found');
    const b = bSnap.data();
    if (b.paid) return { alreadyPaid: true };
    if (b.status === 'cancelled') throw new Error('booking-cancelled');
    if (b.status === 'noshow')    throw new Error('booking-noshow');

    const cRef = b.clientId ? doc(db, 'salons', salonId, 'clients', b.clientId) : null;
    const cSnap = cRef ? await tx.get(cRef) : null;

    // ── THEN ALL WRITES ──
    const pts = pointsPerVisit || 10;
    tx.update(bRef, {
      paid: true, status: 'completed',
      paidAt: serverTimestamp(),
      paymentMethod: method,
      pointsAwarded: pts,
    });

    if (cSnap?.exists()) {
      const c = cSnap.data();
      const visits = (c.visits || 0) + 1;
      const points = (c.points || 0) + pts;
      const spent  = (c.totalSpent || 0) + (Number(b.finalPrice) || Number(b.servicePrice) || 0);
      const target = loyaltyVisits || 10;
      const discount = loyaltyDiscount || 20;
      const updates = { visits, points, totalSpent: spent };
      if (visits > 0 && visits % target === 0) {
        updates.discounts = [...(c.discounts || []), {
          type: 'loyalty',
          title: '⭐ Desconto de Fidelização',
          description: `${discount}% — ${visits} visitas atingidas`,
          code: `LOYAL${visits}-${(c.referralCode || '').split('-')[1] || Math.floor(Math.random()*999)}`,
          discount, expiresAt: null, used: false,
          createdAt: new Date().toISOString()
        }];
      }
      tx.update(cRef, updates);
    }
    return { ok: true };
  });
}

/** Mark booking as no-show + deduct points. Atomic.
 *  Single read followed by writes — no reordering issue here, but kept the same
 *  shape as markBookingPaid for consistency. */
export async function markBookingNoShow({ salonId, bookingId, penalty }) {
  const bRef = doc(db, 'salons', salonId, 'bookings', bookingId);
  return await runTransaction(db, async (tx) => {
    const bSnap = await tx.get(bRef);
    if (!bSnap.exists()) throw new Error('booking-not-found');
    const b = bSnap.data();
    if (b.status === 'noshow')    return { alreadyNoShow: true };
    if (b.status === 'completed') throw new Error('booking-completed');
    if (b.status === 'cancelled') throw new Error('booking-cancelled');
    // All writes
    tx.update(bRef, { status: 'noshow', noShowAt: serverTimestamp() });
    if (b.clientId && penalty > 0) {
      const cRef = doc(db, 'salons', salonId, 'clients', b.clientId);
      tx.update(cRef, { points: increment(-penalty) });
    }
    return { ok: true };
  });
}

/* ── Theme (light/dark) ──────────────────────────────────── */
/* Default: LIGHT. We deliberately do NOT honour prefers-color-scheme on first
 * visit because the booking experience is meant to feel bright and inviting,
 * not "system mode" by accident. User can toggle and choice is persisted. */
const THEME_KEY = 'bookit:theme';
export function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}
export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}
export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}
// Apply on every page load
setTheme(getTheme());

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
