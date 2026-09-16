/* ============================================================
   Book It — retention-core.js
   Client cadence & risk. Pure functions: no Firebase, no DOM.

   The model is deliberately simple and EXPLAINABLE, because the owner has to
   trust it enough to send a message: "a Ana vinha a cada 5 semanas; passaram 9".
   No black box, no prediction — just the client's own rhythm.
   ============================================================ */
import { daysBetween, addDaysStr, normalizePhone } from './booking-core.js';

export const RETENTION_DEFAULTS = {
  atRiskFactor: 1.25,     // overdue ≥ 1.25× cadence → at risk
  lostFactor: 2.5,        // overdue ≥ 2.5× cadence  → lost
  inactiveDays: 365,      // beyond a year: stop suggesting (low value, feels creepy)
  defaultCadenceDays: 42, // 6 weeks, only when there is no history at all
  minCadenceDays: 10,     // clamp: protects against odd data (two visits same week)
  maxCadenceDays: 180,
  minIntervalsForService: 5, // service-level cadence needs this many observations
  cooldownDays: 30,       // don't suggest the same client again this soon
  dismissDays: 180,       // "dispensar" hides the client for this long
  historyDays: 540,       // how far back we look to build cadence (18 months)
};

export const RISK = { SCHEDULED: 'agendado', HEALTHY: 'saudável', AT_RISK: 'em risco', LOST: 'perdido', INACTIVE: 'inativo', NEW: 'novo' };

/**
 * Identity of the person behind a booking.
 *
 * PHONE FIRST, deliberately: the same human books as a guest (no clientId) and
 * later from an account (clientId set). Keying on clientId would split them into
 * two profiles and destroy the cadence. The phone is the stable identity in
 * Portugal and is present on every booking we accept.
 */
export function clientKeyOf(b) {
  return b.clientPhoneE164
    || normalizePhone(b.clientPhone)
    || b.clientId
    || (b.clientEmail || '').trim().toLowerCase()
    || null;
}

export function median(nums) {
  const a = nums.filter(n => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

const toMs = (v) => {
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const price = (b) => Number(b.finalPrice ?? b.servicePrice) || 0;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const mostFrequent = (arr) => {
  const m = new Map();
  for (const v of arr) if (v) m.set(v, (m.get(v) || 0) + 1);
  let best = null, n = 0;
  for (const [k, c] of m) if (c > n) { best = k; n = c; }
  return best;
};

/**
 * Cadence per service, computed across all clients: the median gap between two
 * consecutive visits of the same client for that service. Used when a client
 * has only one visit, so we can still say something sensible.
 */
export function serviceCadences(visitsByClient, opts = RETENTION_DEFAULTS) {
  const perService = new Map();
  for (const visits of visitsByClient) {
    for (let i = 1; i < visits.length; i++) {
      const gap = daysBetween(visits[i - 1].date, visits[i].date);
      if (gap <= 0 || gap > opts.maxCadenceDays * 3) continue;
      const svc = visits[i].serviceName || '—';
      if (!perService.has(svc)) perService.set(svc, []);
      perService.get(svc).push(gap);
    }
  }
  const out = new Map();
  for (const [svc, gaps] of perService) {
    if (gaps.length >= opts.minIntervalsForService) out.set(svc, clamp(median(gaps), opts.minCadenceDays, opts.maxCadenceDays));
  }
  return out;
}

/**
 * Build one profile per client from raw bookings.
 * @param {object} p
 * @param {Array}  p.bookings      all bookings in the history window (any status)
 * @param {string} p.today         salon-local YYYY-MM-DD
 * @param {Array}  p.reactivations log of messages already sent ({ clientKey, kind, sentAt })
 * @param {object} p.opts
 * @returns {{ profiles: Array, salonCadenceDays: number|null }}
 */
export function buildClientProfiles({ bookings, today, reactivations = [], opts = {} }) {
  const o = { ...RETENTION_DEFAULTS, ...opts };
  const nowMs = Date.parse(today + 'T12:00:00Z');

  // Last contact per client (cooldown / dismissal)
  const lastContact = new Map();
  for (const r of reactivations) {
    if (!r?.clientKey) continue;
    const ms = toMs(r.sentAt) ?? 0;
    const prev = lastContact.get(r.clientKey);
    if (!prev || ms > prev.ms) lastContact.set(r.clientKey, { ms, kind: r.kind || 'sent' });
  }

  // Group bookings per client
  const groups = new Map();
  for (const b of bookings) {
    const k = clientKeyOf(b);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }

  const visitsByClient = [];
  for (const list of groups.values()) {
    visitsByClient.push(list.filter(b => b.status === 'completed').sort((a, b) => a.date.localeCompare(b.date)));
  }
  const svcCadence = serviceCadences(visitsByClient, o);

  // Salon-wide cadence: median of each client's own median gap
  const ownCadences = [];
  for (const visits of visitsByClient) {
    const gaps = [];
    for (let i = 1; i < visits.length; i++) {
      const g = daysBetween(visits[i - 1].date, visits[i].date);
      if (g > 0 && g <= o.maxCadenceDays * 3) gaps.push(g);
    }
    const m = median(gaps);
    if (m) ownCadences.push(m);
  }
  const salonCadenceDays = ownCadences.length ? clamp(median(ownCadences), o.minCadenceDays, o.maxCadenceDays) : null;

  const profiles = [];
  for (const [key, list] of groups) {
    const visits = list.filter(b => b.status === 'completed').sort((a, b) => a.date.localeCompare(b.date));
    const upcoming = list.filter(b => ['pending', 'confirmed'].includes(b.status) && b.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const latest = list.slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))[0];
    const noShows = list.filter(b => b.status === 'noshow').length;

    // cadence: own rhythm → service rhythm → salon rhythm → default
    const gaps = [];
    for (let i = 1; i < visits.length; i++) {
      const g = daysBetween(visits[i - 1].date, visits[i].date);
      if (g > 0 && g <= o.maxCadenceDays * 3) gaps.push(g);
    }
    const ownMedian = median(gaps);
    const topService = mostFrequent(visits.map(v => v.serviceName)) || latest?.serviceName || null;
    let cadenceDays, cadenceSource;
    if (ownMedian) { cadenceDays = clamp(ownMedian, o.minCadenceDays, o.maxCadenceDays); cadenceSource = 'own'; }
    else if (topService && svcCadence.has(topService)) { cadenceDays = svcCadence.get(topService); cadenceSource = 'service'; }
    else if (salonCadenceDays) { cadenceDays = salonCadenceDays; cadenceSource = 'salon'; }
    else { cadenceDays = o.defaultCadenceDays; cadenceSource = 'default'; }

    const lastVisit = visits.length ? visits[visits.length - 1].date : null;
    const daysSince = lastVisit ? daysBetween(lastVisit, today) : null;
    const overdueRatio = (daysSince != null && cadenceDays) ? daysSince / cadenceDays : null;

    // money actually spent (attributed, never estimated)
    const paid = visits.filter(b => b.paid);
    const totalSpent = paid.reduce((a, b) => a + price(b), 0);
    const spent12m = paid.filter(b => daysBetween(b.date, today) <= 365).reduce((a, b) => a + price(b), 0);
    const avgTicket = paid.length ? Math.round(totalSpent / paid.length * 100) / 100 : (latest ? price(latest) : 0);

    let status;
    if (upcoming.length) status = RISK.SCHEDULED;
    else if (!visits.length) status = RISK.NEW;
    else if (daysSince > o.inactiveDays) status = RISK.INACTIVE;
    else if (overdueRatio >= o.lostFactor) status = RISK.LOST;
    else if (overdueRatio >= o.atRiskFactor) status = RISK.AT_RISK;
    else status = RISK.HEALTHY;

    const contact = lastContact.get(key);
    const cooldownDays = contact?.kind === 'dismissed' ? o.dismissDays : o.cooldownDays;
    // Clamped at 0: "today" is anchored at noon, so a message sent later today
    // would otherwise read as -1 days.
    const daysSinceContact = contact ? Math.max(0, Math.floor((nowMs - contact.ms) / 86400000)) : null;
    const suppressed = contact != null && daysSinceContact < cooldownDays;

    profiles.push({
      key,
      clientId: latest?.clientId || null,
      name: latest?.clientName || '—',
      phone: latest?.clientPhoneE164 || normalizePhone(latest?.clientPhone) || null,
      email: latest?.clientEmail || null,
      visits: visits.length,
      noShows,
      firstVisit: visits.length ? visits[0].date : null,
      lastVisit,
      lastService: visits.length ? visits[visits.length - 1].serviceName : latest?.serviceName || null,
      lastStaffId: visits.length ? visits[visits.length - 1].staffId : latest?.staffId || null,
      lastStaffName: visits.length ? visits[visits.length - 1].staffName : latest?.staffName || null,
      topService,
      cadenceDays, cadenceSource,
      expectedNext: lastVisit ? addDaysStr(lastVisit, cadenceDays) : null,
      daysSince, overdueRatio,
      status,
      totalSpent, spent12m, avgTicket,
      upcomingDate: upcoming.length ? upcoming[0].date : null,
      lastContactAt: contact?.ms || null, lastContactKind: contact?.kind || null, daysSinceContact,
      suppressed,
    });
  }

  return { profiles, salonCadenceDays };
}

/** The list the owner acts on: at risk + lost, not scheduled, not suppressed, sorted by money. */
export function reactivationCandidates(profiles, { statuses = [RISK.AT_RISK, RISK.LOST], includeSuppressed = false, requirePhone = true } = {}) {
  return profiles
    .filter(p => statuses.includes(p.status))
    .filter(p => includeSuppressed || !p.suppressed)
    .filter(p => !requirePhone || !!p.phone)
    .sort((a, b) => (b.spent12m - a.spent12m) || (b.totalSpent - a.totalSpent) || (b.overdueRatio - a.overdueRatio));
}

/** Headline numbers for the panel. Money is what clients actually spent (12 months). */
export function retentionSummary(profiles) {
  const by = (s) => profiles.filter(p => p.status === s);
  const sum = (list, f = (p) => p.spent12m) => Math.round(list.reduce((a, p) => a + f(p), 0) * 100) / 100;
  const atRisk = by(RISK.AT_RISK), lost = by(RISK.LOST);
  return {
    total: profiles.length,
    scheduled: by(RISK.SCHEDULED).length,
    healthy: by(RISK.HEALTHY).length,
    atRisk: atRisk.length, atRiskValue: sum(atRisk),
    lost: lost.length, lostValue: sum(lost),
    inactive: by(RISK.INACTIVE).length,
    new: by(RISK.NEW).length,
    contactable: profiles.filter(p => [RISK.AT_RISK, RISK.LOST].includes(p.status) && p.phone && !p.suppressed).length,
  };
}

/* ── Wording (pt-PT) ─────────────────────────────────────── */
const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export function monthLabelPT(dateStr) {
  if (!dateStr) return '';
  const [, m] = dateStr.split('-').map(Number);
  return MONTHS[m - 1] || '';
}
const weeks = (d) => Math.max(1, Math.round(d / 7));

/** The explanation shown on the card — this is what makes the owner trust it. */
export function explain(p) {
  if (!p.lastVisit) return 'Ainda sem visita concluída.';
  const w = weeks(p.cadenceDays), sw = weeks(p.daysSince);
  const rhythm = p.cadenceSource === 'own'
    ? `Vinha a cada ${w} semana${w === 1 ? '' : 's'}`
    : p.cadenceSource === 'service'
      ? `Quem faz ${p.topService} costuma voltar a cada ${w} semanas`
      : `Os clientes do salão voltam a cada ${w} semanas`;
  return `${rhythm}; já passaram ${sw} semana${sw === 1 ? '' : 's'} desde ${monthLabelPT(p.lastVisit)}.`;
}

/** Personal, human, and sent from the salon's own WhatsApp — not a bulk campaign. */
export function reactivationMessage({ profile, salonName, link, tone = 'warm' }) {
  const first = String(profile.name || '').trim().split(/\s+/)[0] || '';
  const hi = first ? `Olá ${first}! ` : 'Olá! ';
  const svc = profile.topService || profile.lastService;
  const since = profile.lastVisit ? ` desde ${monthLabelPT(profile.lastVisit)}` : '';
  const svcPart = svc ? ` para ${svc}` : '';
  const body = tone === 'short'
    ? `${hi}Fala o ${salonName} 👋 Tens vontade de marcar${svcPart}?`
    : `${hi}Fala o ${salonName} 👋 Reparámos que já não te vemos${since} e lembrámo-nos de ti. Se quiseres voltar${svcPart}, tens aqui a nossa agenda:`;
  return `${body}\n${link}\nQualquer dúvida é só responder por aqui 🙂`;
}
