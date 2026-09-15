/* ============================================================
   Book It — metrics-core.js
   Pure baseline metrics over bookings. No Firebase, no DOM.
   Everything here is either ATTRIBUTED (counted from records) or clearly
   labelled as a rate; nothing is estimated or extrapolated.
   ============================================================ */
import { resolveDayWindow, addDaysStr, daysBetween, timeToMin } from './booking-core.js';

export const CLOSED_STATUSES = ['completed', 'noshow'];        // appointment time passed and was resolved
export const OCCUPYING_STATUSES = ['pending', 'confirmed', 'completed', 'noshow']; // blocked a slot

const price = (b) => Number(b.finalPrice ?? b.servicePrice) || 0;
const minutes = (b) => (Number.isFinite(b.endMin) && Number.isFinite(b.startMin)) ? (b.endMin - b.startMin) : (Number(b.serviceDuration) || 0);
const clientKey = (b) => b.clientId || b.clientPhoneE164 || (b.clientEmail || '').toLowerCase() || null;
const ratio = (num, den) => den > 0 ? num / den : null;

/** ISO Monday of the week that contains dateStr. */
export function weekStartOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

/**
 * Minutes the salon could sell between two dates (inclusive): per active staff
 * member, per day, the working window minus breaks, honouring salon and staff
 * schedules, time-off and closed dates.
 */
export function availableMinutes({ from, to, schedule, staff = [], closedDates = [] }) {
  let total = 0;
  const perStaff = new Map();
  for (let d = from; d <= to; d = addDaysStr(d, 1)) {
    for (const s of staff) {
      if (s.active === false) continue;
      const w = resolveDayWindow({ salonSchedule: schedule, staff: s, dateStr: d, closedDates });
      if (w.closed) continue;
      const breaks = (w.breaks || []).reduce((a, b) => a + (b.end - b.start), 0);
      const mins = Math.max(0, w.close - w.open - breaks);
      total += mins;
      perStaff.set(s.id, (perStaff.get(s.id) || 0) + mins);
    }
  }
  return { total, perStaff };
}

/**
 * Baseline for a period [from, to] (dates of the appointments).
 * @param {object} p
 * @param {Array}  p.bookings     bookings whose `date` is within [from,to]
 * @param {Array}  p.laterBookings bookings with date > to (for rebooking), optional
 * @param {string} p.from, p.to
 * @param {string} p.today        salon-local today (only past days count for no-show/occupancy)
 * @param {object} p.schedule     config/schedule; p.staff active staff docs; p.closedDates
 */
export function computeBaseline({ bookings, laterBookings = [], from, to, today, schedule = null, staff = [], closedDates = [] }) {
  const inRange = bookings.filter(b => b.date >= from && b.date <= to);
  const pastEnd = to < today ? to : addDaysStr(today, -1);           // last fully elapsed day in range
  const past = inRange.filter(b => b.date <= pastEnd);

  const byStatus = {};
  for (const b of inRange) byStatus[b.status] = (byStatus[b.status] || 0) + 1;

  const completed = inRange.filter(b => b.status === 'completed');
  const paid = completed.filter(b => b.paid);
  const revenue = paid.reduce((a, b) => a + price(b), 0);

  // No-show: only appointments whose time has passed and were resolved.
  const pastResolved = past.filter(b => CLOSED_STATUSES.includes(b.status));
  const pastNoShow = past.filter(b => b.status === 'noshow');
  const pastUnresolved = past.filter(b => ['pending', 'confirmed'].includes(b.status)); // data-quality flag

  // Cancellations over everything scheduled in the range.
  const cancelled = inRange.filter(b => b.status === 'cancelled');
  const lateCancellations = cancelled.filter(b => b.cancelledAt && b.date && (() => {
    const at = b.cancelledAt?.toDate ? b.cancelledAt.toDate() : new Date(b.cancelledAt?.seconds ? b.cancelledAt.seconds * 1000 : b.cancelledAt);
    const appt = new Date(`${b.date}T${b.time || '00:00'}:00`);
    return Number.isFinite(at.getTime()) && (appt - at) < 24 * 3600 * 1000;
  })());

  // Confirmation coverage (the thing the team controls) — among non-cancelled.
  const live = inRange.filter(b => b.status !== 'cancelled');
  const requested = live.filter(b => !!b.confirmRequestedAt);
  const confirmed = live.filter(b => !!b.confirmedVia || b.status === 'confirmed' || b.status === 'completed');
  const confirmedByLink = live.filter(b => b.confirmedVia === 'link');
  const noShowAmongConfirmed = past.filter(b => b.status === 'noshow' && !!b.confirmedVia).length;
  const noShowAmongUnconfirmed = past.filter(b => b.status === 'noshow' && !b.confirmedVia).length;
  const pastConfirmed = past.filter(b => !!b.confirmedVia && CLOSED_STATUSES.includes(b.status)).length;
  const pastUnconfirmed = past.filter(b => !b.confirmedVia && CLOSED_STATUSES.includes(b.status)).length;

  // Occupancy: blocked minutes over sellable minutes, past days only.
  const occFrom = from, occTo = pastEnd;
  const avail = (schedule && occTo >= occFrom) ? availableMinutes({ from: occFrom, to: occTo, schedule, staff, closedDates }) : { total: 0, perStaff: new Map() };
  const blocked = past.filter(b => OCCUPYING_STATUSES.includes(b.status)).reduce((a, b) => a + minutes(b), 0);

  // Rebooking within 60 days after a completed visit (client identified by id/phone/email).
  const all = [...inRange, ...laterBookings];
  const rebook = { eligible: 0, rebooked: 0 };
  for (const b of completed.filter(b => daysBetween(b.date, today) >= 60)) {
    const k = clientKey(b); if (!k) continue;
    rebook.eligible++;
    const has = all.some(x => x !== b && clientKey(x) === k && x.status !== 'cancelled' && x.date > b.date && daysBetween(b.date, x.date) <= 60);
    if (has) rebook.rebooked++;
  }

  // Breakdowns
  const group = (list, keyFn) => {
    const m = new Map();
    for (const b of list) { const k = keyFn(b) || '—'; const g = m.get(k) || { key: k, bookings: 0, revenue: 0, noshow: 0, cancelled: 0 }; g.bookings++; if (b.status === 'completed' && b.paid) g.revenue += price(b); if (b.status === 'noshow') g.noshow++; if (b.status === 'cancelled') g.cancelled++; m.set(k, g); }
    return [...m.values()].sort((a, b) => b.bookings - a.bookings);
  };
  const byChannel = group(inRange, b => b.source === 'online' ? `online${b.channel ? ':' + b.channel : ''}` : (b.source || 'online'));
  const byStaff = group(inRange, b => b.staffName || b.staffId);
  const byService = group(inRange, b => b.serviceName);
  const byWeek = group(inRange, b => weekStartOf(b.date)).sort((a, b) => a.key.localeCompare(b.key));

  return {
    period: { from, to, days: daysBetween(from, to) + 1, pastDays: occTo >= from ? daysBetween(from, occTo) + 1 : 0 },
    counts: { total: inRange.length, byStatus, live: live.length, completed: completed.length, paid: paid.length },
    revenue: { total: revenue, avgTicket: ratio(revenue, paid.length) },
    noShow: { count: pastNoShow.length, resolved: pastResolved.length, rate: ratio(pastNoShow.length, pastResolved.length), unresolvedPast: pastUnresolved.length,
              rateConfirmed: ratio(noShowAmongConfirmed, pastConfirmed), rateUnconfirmed: ratio(noShowAmongUnconfirmed, pastUnconfirmed) },
    cancellations: { count: cancelled.length, rate: ratio(cancelled.length, inRange.length), late: lateCancellations.length, byClient: cancelled.filter(b => (b.cancelledBy || '').startsWith('client')).length },
    confirmation: { requested: requested.length, requestRate: ratio(requested.length, live.length), confirmed: confirmed.length, confirmedRate: ratio(confirmed.length, live.length), byLink: confirmedByLink.length },
    occupancy: { bookedMinutes: blocked, availableMinutes: avail.total, rate: ratio(blocked, avail.total) },
    rebooking: { ...rebook, rate: ratio(rebook.rebooked, rebook.eligible) },
    byChannel, byStaff, byService, byWeek,
  };
}

export const pct = (r, digits = 0) => r == null ? '—' : `${(r * 100).toFixed(digits)}%`;
export const eur = (n) => n == null ? '—' : `${(Math.round(n * 100) / 100).toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}€`;
