/* ============================================================
   Book It — Shared utilities
   ------------------------------------------------------------
   One source of truth for: HTML escaping, toast, date helpers,
   query helpers, salon branding, click delegation.
   ============================================================ */

import {
  db, doc, getDoc
} from './firebase.js';

/* ── DOM helpers ──────────────────────────────────────────── */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ── HTML escaping (XSS protection) ───────────────────────── */
const ESC = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
export const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
/** Tagged template that auto-escapes interpolations. Use as: html`<div>${untrusted}</div>` */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((str, i) => {
    out += str;
    if (i < values.length) out += escapeHTML(values[i]);
  });
  return out;
}
/** Insert raw HTML inside a template literal without escaping. Only use for trusted, already-escaped strings. */
export const raw = (s) => ({ __raw: true, value: String(s) });
export function htmlMix(strings, ...values) {
  let out = '';
  strings.forEach((str, i) => {
    out += str;
    if (i < values.length) {
      const v = values[i];
      out += v && v.__raw ? v.value : escapeHTML(v);
    }
  });
  return out;
}

/* ── Toast ────────────────────────────────────────────────── */
let toastTimer;
export function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.className = ''; // clear modifiers
  if (kind) t.classList.add(`toast--${kind}`);
  t.textContent = msg;
  // force reflow so re-triggering replays the animation
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
export const toastSuccess = (m) => toast(m, 'success');
export const toastError   = (m) => toast(m, 'error');

/* ── Dates ────────────────────────────────────────────────── */
export const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
export const WEEKDAYS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
export const WEEKDAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

/** YYYY-MM-DD from Date */
export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "15 Maio 2026" from YYYY-MM-DD */
export function formatDatePT(str, opts = {}) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  const months = opts.short ? MONTHS_SHORT : MONTHS_FULL;
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

/** Long: "15 de Maio de 2026" */
export function formatDateLongPT(date) {
  return `${date.getDate()} de ${MONTHS_FULL[date.getMonth()]} de ${date.getFullYear()}`;
}

/* ── URL / Salon ID ──────────────────────────────────────── */
const DEFAULT_SALON = 'zenorganic';
export function getSalonId() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('salon') || DEFAULT_SALON).trim();
}

/* ── Apply salon branding (color, name, header) ──────────── */
export function applySalonBranding(salon, opts = {}) {
  if (!salon) return;
  if (salon.primaryColor) {
    document.documentElement.style.setProperty('--brand', salon.primaryColor);
    document.documentElement.style.setProperty('--brand-dark', salon.primaryColorDark || salon.primaryColor);
    if (salon.primaryColorLight) document.documentElement.style.setProperty('--brand-light', salon.primaryColorLight);
  }
  const titleSuffix = opts.titleSuffix ?? salon.name;
  if (titleSuffix && opts.titlePrefix) {
    document.title = `${opts.titlePrefix} — ${titleSuffix}`;
  } else if (titleSuffix) {
    document.title = titleSuffix;
  }

  const headerName = $('#headerName');
  const headerMark = $('#headerMark');
  const headerSub  = $('#headerSub');
  if (headerName) headerName.textContent = salon.name || 'Book It';
  if (headerMark) headerMark.textContent = (salon.name || 'B').charAt(0).toUpperCase();
  if (headerSub && salon.tagline) headerSub.textContent = salon.tagline;
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

/* ── Click delegation (replaces inline onclick) ──────────── */
const handlers = new Map();
/** Register a click handler bound to elements with [data-action="name"]. */
export function on(action, fn) {
  handlers.set(action, fn);
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.getAttribute('data-action');
  const fn = handlers.get(action);
  if (fn) {
    e.preventDefault();
    fn(el, e);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('[data-action]');
  if (!el || !['BUTTON', 'A'].includes(el.tagName)) {
    // For non-native interactive elements (e.g. <div role="button">) support keyboard
    if (el && el.getAttribute('role') === 'button') {
      e.preventDefault();
      el.click();
    }
  }
});

/* ── Page-level loading / error ──────────────────────────── */
export function showFatalError(msg) {
  const main = document.querySelector('main') || document.body;
  main.innerHTML = `
    <div class="container" style="padding: 60px 0">
      <div class="error-state">
        <div class="error-state__icon" aria-hidden="true">⚠️</div>
        <div class="error-state__title">Algo correu mal</div>
        <div class="error-state__desc">${escapeHTML(msg)}</div>
        <button class="btn btn--ghost" type="button" onclick="location.reload()">Tentar de novo</button>
      </div>
    </div>`;
}

/* ── Form helpers ─────────────────────────────────────────── */
export function getFormValues(form, fields) {
  const out = {};
  for (const id of fields) {
    const el = form.querySelector(`#${id}`) || document.getElementById(id);
    out[id] = el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : '';
  }
  return out;
}
export function clearForm(ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) {
      if (el.type === 'checkbox') el.checked = false;
      else el.value = '';
    }
  }
}
export function showError(fieldId, msg) {
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
export function clearErrors(root = document) {
  root.querySelectorAll('.field[data-invalid="true"]').forEach(f => {
    f.removeAttribute('data-invalid');
    const err = f.querySelector('.field__error');
    if (err) err.textContent = '';
  });
}

/* ── Firebase error mapping (user-friendly PT) ───────────── */
export function authErrorMessage(code) {
  const map = {
    'auth/email-already-in-use':   'Este email já está registado. Tenta entrar.',
    'auth/invalid-email':          'Email inválido.',
    'auth/weak-password':          'Password demasiado fraca (mínimo 6 caracteres).',
    'auth/user-not-found':         'Email ou password incorretos.',
    'auth/wrong-password':         'Email ou password incorretos.',
    'auth/invalid-credential':     'Email ou password incorretos.',
    'auth/too-many-requests':      'Demasiadas tentativas. Aguarda alguns minutos.',
    'auth/network-request-failed': 'Sem ligação à internet.',
    'auth/requires-recent-login':  'Por segurança, sai e entra de novo antes de alterar a password.',
  };
  return map[code] || 'Ocorreu um erro. Tenta novamente.';
}

/* ── Money / formatting ──────────────────────────────────── */
export const formatPrice = (v) => `${(Number(v) || 0).toFixed(0).replace(/\.0+$/, '')}€`;

/* ── Status helpers ───────────────────────────────────────── */
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
  cancelled:  'badge--red',
  noshow:     'badge--gray',
};
export function statusBadge(status) {
  const cls = STATUS_BADGE_CLS[status] || 'badge--gray';
  return `<span class="badge ${cls}">${escapeHTML(STATUS_LABELS[status] || status || '—')}</span>`;
}

/* ── Generate referral code ──────────────────────────────── */
export function generateReferralCode(name, salonId) {
  const prefix = (salonId || 'BK').slice(0, 3).toUpperCase();
  const part   = (name || '').replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'USER';
  const num    = Math.floor(10 + Math.random() * 90);
  return `${prefix}-${part}${num}`;
}
