/* ============================================================
   Book It — booking-core.js
   Pure business rules. NO Firebase, NO DOM. Runs in the browser
   (imported by app.js) and in Node (unit tests).
   ============================================================ */

/* ── Time helpers ─────────────────────────────────────────── */
export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function timeToMin(t) {
  const m = TIME_RE.exec(String(t || ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
export function minToTime(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function isValidDateStr(s) {
  if (!DATE_RE.test(String(s || ''))) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export function addDaysStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
/** 0 = Sunday … 6 = Saturday, computed from the string (timezone-independent). */
export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export const WEEKDAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

/**
 * "Now" expressed in the salon's timezone as { dateStr, minutes }.
 * All booking times are wall-clock strings in the salon's timezone, so DST
 * never shifts a 10:00 appointment.
 */
export function nowInTimezone(tz = 'Europe/Lisbon', at = new Date()) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat('en-GB', {
      hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(at);
  }
  const get = (t) => parts.find(p => p.type === t)?.value;
  const hour = Number(get('hour')) % 24;
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + Number(get('minute')),
  };
}

/* ── Intervals ────────────────────────────────────────────── */
/** Half-open intervals [start,end) in minutes. */
export function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}
export function overlapsAny(iv, list) {
  return (list || []).some(x => overlaps(iv, x));
}

/* ── Opening hours resolution ─────────────────────────────── */
/**
 * Resolve the effective working window for a given date.
 * @param {object} salonSchedule   config/schedule doc: { monday: {open, close, closed, breakStart?, breakEnd?}, … }
 * @param {object|null} staff      staff doc (may carry .schedule override and .timeOff ranges)
 * @param {string} dateStr
 * @param {string[]} closedDates   salon-wide closed dates (holidays)
 * @returns {{closed:boolean, reason?:string, open:number, close:number, breaks:{start:number,end:number}[]}}
 */
export function resolveDayWindow({ salonSchedule, staff, dateStr, closedDates = [] }) {
  if ((closedDates || []).includes(dateStr)) return { closed: true, reason: 'salon-closed-date', open: 0, close: 0, breaks: [] };
  const key = WEEKDAY_KEYS[weekdayOf(dateStr)];
  const salonDay = salonSchedule?.[key];
  if (!salonDay || salonDay.closed) return { closed: true, reason: 'salon-closed', open: 0, close: 0, breaks: [] };

  if (staff) {
    for (const off of (staff.timeOff || [])) {
      if (off && off.from && off.to && dateStr >= off.from && dateStr <= off.to) {
        return { closed: true, reason: 'staff-time-off', open: 0, close: 0, breaks: [] };
      }
    }
  }
  const staffDay = staff?.schedule?.[key];
  if (staffDay && staffDay.closed) return { closed: true, reason: 'staff-day-off', open: 0, close: 0, breaks: [] };

  const day = (staffDay && staffDay.open && staffDay.close) ? staffDay : salonDay;
  const open = timeToMin(day.open), close = timeToMin(day.close);
  if (open == null || close == null || close <= open) return { closed: true, reason: 'invalid-hours', open: 0, close: 0, breaks: [] };

  const breaks = [];
  const bs = timeToMin(day.breakStart), be = timeToMin(day.breakEnd);
  if (bs != null && be != null && be > bs) breaks.push({ start: bs, end: be });
  return { closed: false, open, close, breaks };
}

/* ── Slot generation ──────────────────────────────────────── */
/**
 * Generate bookable start times (minutes) for one staff member on one day.
 * @param {object} p
 * @param {number} p.open, p.close      working window (minutes)
 * @param {Array}  p.breaks             [{start,end}]
 * @param {number} p.duration           service duration (minutes)
 * @param {number} p.interval           slot grid (minutes), e.g. 15
 * @param {Array}  p.occupied           existing intervals [{start,end}] (any status that blocks)
 * @param {number|null} p.notBefore     earliest allowed start (minutes) — lead-time cutoff for "today"; null = no cutoff
 */
export function generateSlots({ open, close, breaks = [], duration, interval = 15, occupied = [], notBefore = null }) {
  const out = [];
  if (!(duration > 0) || !(interval > 0) || close <= open) return out;
  const blocked = [...breaks, ...occupied];
  for (let s = open; s + duration <= close; s += interval) {
    if (notBefore != null && s < notBefore) continue;
    const iv = { start: s, end: s + duration };
    if (overlapsAny(iv, blocked)) continue;
    out.push(s);
  }
  return out;
}

/** Is a specific [start, start+duration) bookable? Returns null if OK or a reason code. */
export function checkSlot({ window, duration, start, occupied = [], notBefore = null }) {
  if (window.closed) return window.reason || 'closed';
  if (start < window.open || start + duration > window.close) return 'outside-hours';
  if (notBefore != null && start < notBefore) return 'too-soon';
  const iv = { start, end: start + duration };
  if (overlapsAny(iv, window.breaks)) return 'break';
  if (overlapsAny(iv, occupied)) return 'slot-taken';
  return null;
}

/* ── Booking state machine ────────────────────────────────── */
export const STATUSES = ['pending','confirmed','completed','cancelled','noshow'];
/** Statuses that occupy the agenda. */
export const BLOCKING_STATUSES = ['pending','confirmed'];

const TRANSITIONS = {
  pending:   ['confirmed','completed','cancelled','noshow'],
  confirmed: ['completed','cancelled','noshow'],
  completed: [],
  cancelled: ['pending','confirmed'],   // only via restore (undo) — re-checks the agenda
  noshow:    [],
};
export function canTransition(from, to) {
  return !!TRANSITIONS[from] && TRANSITIONS[from].includes(to);
}

/**
 * Cancellation policy for clients: allowed only up to `cancellationHours`
 * before the appointment (salon time).
 */
export function clientCanCancel({ booking, cancellationHours = 24, now }) {
  if (!BLOCKING_STATUSES.includes(booking.status)) return { ok: false, reason: 'status' };
  const apptMin = timeToMin(booking.time);
  if (apptMin == null) return { ok: false, reason: 'invalid' };
  // minutes from now until appointment, comparing salon-local date strings
  const dayDiff = daysBetween(now.dateStr, booking.date);
  const minutesUntil = dayDiff * 1440 + (apptMin - now.minutes);
  if (minutesUntil < cancellationHours * 60) return { ok: false, reason: 'too-late', minutesUntil };
  return { ok: true, minutesUntil };
}
export function daysBetween(fromStr, toStr) {
  const p = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(toStr) - p(fromStr)) / 86400000);
}

/* ── Validation ───────────────────────────────────────────── */
export const isEmail = (v) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(String(v ?? '').trim());
export const isPhone = (v) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length >= 9 && d.length <= 15; };
export const isHexColor = (v) => /^#[0-9A-Fa-f]{6}$/.test(String(v ?? ''));
export const isSlug = (v) => /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(String(v ?? ''));
export const clampStr = (v, max) => String(v ?? '').trim().slice(0, max);

export function validateBookingInput({ name, email, phone, date, time, notes, forSomeone }) {
  const errors = {};
  if (!clampStr(name, 80) || clampStr(name, 80).length < 2) errors.name = 'Indica o teu nome.';
  // Portugal-first: the phone is the identity (WhatsApp); email is optional but must be valid if given.
  if (String(email ?? '').trim() && !isEmail(email)) errors.email = 'Email inválido.';
  if (!normalizePhone(phone)) errors.phone = 'Telemóvel inválido (ex.: 912 345 678).';
  if (!isValidDateStr(date)) errors.date = 'Data inválida.';
  if (timeToMin(time) == null) errors.time = 'Hora inválida.';
  if (notes && String(notes).length > 500) errors.notes = 'Notas demasiado longas (máx. 500).';
  if (forSomeone && String(forSomeone).length > 80) errors.forSomeone = 'Nome demasiado longo.';
  return { ok: Object.keys(errors).length === 0, errors };
}

/* ── Pricing ──────────────────────────────────────────────── */
export function applyDiscount(price, percent) {
  const p = Number(price) || 0, pct = Math.max(0, Math.min(100, Number(percent) || 0));
  return Math.round(p * (1 - pct / 100) * 100) / 100;
}

/* ── Calendar file (.ics) ─────────────────────────────────── */
function icsEscape(s) { return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
export function buildICS({ uid, title, description = '', location = '', dateStr, time, durationMin, tz = 'Europe/Lisbon', url = '' }) {
  const start = timeToMin(time);
  const end = start + durationMin;
  const stamp = (d, m) => `${d.replace(/-/g, '')}T${minToTime(m).replace(':', '')}00`;
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Book It//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(uid)}`, `DTSTAMP:${now}`,
    `DTSTART;TZID=${tz}:${stamp(dateStr, start)}`,
    `DTEND;TZID=${tz}:${stamp(dateStr, end)}`,
    `SUMMARY:${icsEscape(title)}`,
    description ? `DESCRIPTION:${icsEscape(description)}` : null,
    location ? `LOCATION:${icsEscape(location)}` : null,
    url ? `URL:${icsEscape(url)}` : null,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}
export function googleCalendarUrl({ title, details = '', location = '', dateStr, time, durationMin, tz = 'Europe/Lisbon' }) {
  const start = timeToMin(time), end = start + durationMin;
  const stamp = (m) => `${dateStr.replace(/-/g, '')}T${minToTime(m).replace(':', '')}00`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, details, location, dates: `${stamp(start)}/${stamp(end)}`, ctz: tz });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/* ── Agenda doc helpers ───────────────────────────────────── */
export const agendaId = (staffId, dateStr) => `${staffId}__${dateStr}`;
export function occupiedFromAgenda(agendaData, excludeBookingId = null) {
  return (agendaData?.intervals || [])
    .filter(iv => iv && iv.bookingId !== excludeBookingId)
    .map(iv => ({ start: iv.start, end: iv.end }));
}

/* ── Phone (Portugal-first, E.164 digits without '+') ─────── */
/**
 * "912 345 678" → "351912345678"; "+351 21 000 0000" → "351210000000";
 * "0034 600..." → "34600...". Returns null when it can't be a real number.
 */
export function normalizePhone(raw, defaultCountry = '351') {
  let d = String(raw ?? '').trim().replace(/[^\d+]/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('+')) d = d.slice(1);
  else if (d.length === 9) d = defaultCountry + d;          // national PT number
  else if (d.startsWith('0') && d.length === 10) d = defaultCountry + d.slice(1);
  if (!/^\d{10,15}$/.test(d)) return null;
  return d;
}
export function formatPhonePT(e164) {
  const d = String(e164 || '');
  if (d.startsWith('351') && d.length === 12) return `${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  return d ? '+' + d : '';
}

/* ── Capability links & WhatsApp ─────────────────────────── */
export function randomToken(bytes = 16) {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
export const manageUrl = (baseUrl, salonId, token) => `${baseUrl.replace(/\/$/, '')}/m.html?s=${encodeURIComponent(salonId)}&t=${encodeURIComponent(token)}`;
export function whatsAppUrl(phone, text) {
  const p = normalizePhone(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const WD_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MO_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "qui, 17 set" — short, human, no year. */
export function dateLabelPT(dateStr) {
  if (!isValidDateStr(dateStr)) return dateStr || '';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${WD_PT[weekdayOf(dateStr)]}, ${d} ${MO_PT[m - 1]}`;
}
/** Message templates (pt-PT). `kind`: confirmRequest | reminder | reminderToday. Keep them short: they are read on a phone. */
export function messageText(kind, { clientName, salonName, serviceName, dateStr, time, link }) {
  const n = firstName(clientName);
  const hi = n ? `Olá ${n}! ` : 'Olá! ';
  const when = `${dateLabelPT(dateStr)} às ${time}`;
  const tail = link ? `\nConfirmar ou alterar: ${link}` : '';
  switch (kind) {
    case 'confirmRequest':
      return `${hi}Aqui é do ${salonName} 👋 Confirmas a tua marcação de *${serviceName}* para *${when}*? Responde *1* para confirmar.${tail}`;
    case 'reminder':
      return `${hi}Lembrete do ${salonName}: *${serviceName}* amanhã, *${when}*. Se precisares de alterar, diz-nos com antecedência.${tail}\nAté já! ✂️`;
    case 'reminderToday':
      return `${hi}É hoje! *${serviceName}* às *${time}* no ${salonName}.${tail}\nAté já! ✂️`;
    case 'freeSlot':
      return `${hi}Surgiu uma vaga no ${salonName}: *${serviceName}*, *${when}*. Queres? Responde *1* e é tua.${tail}`;
    default:
      return `${hi}${salonName}: ${serviceName}, ${when}.${tail}`;
  }
}
