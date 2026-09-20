/* ============================================================
   Book It — waitlist-core.js
   Who wanted the slot that just opened up.

   A cancellation at four in the afternoon leaves tomorrow at ten empty, and
   nobody knows. The salon loses the money in silence. Today a good owner
   remembers "a Dona Maria queria quinta de manhã" and picks up the phone —
   this is the part that does the remembering.

   Pure functions: no Firebase, no DOM.
   ============================================================ */
import { timeToMin, firstName, dateLabelPT } from './booking-core.js';

/** Morning ends at one o'clock: it is lunch that splits a salon's day. */
export const NOON = 13 * 60;

export const PART_OF_DAY = {
  any:       'a qualquer hora',
  morning:   'de manhã',
  afternoon: 'à tarde',
};

/** Days after an offer before we would nudge the same person again. */
export const OFFER_COOLDOWN_DAYS = 3;

const startOf = (slot) => slot.startMin ?? timeToMin(slot.time) ?? 0;
const lengthOf = (slot) => (slot.endMin != null ? slot.endMin - startOf(slot) : slot.duration) || 0;

const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/**
 * Would this person want this freed slot?
 *
 * Deliberately strict about the things that would waste someone's time: the
 * service has to fit, the day has to be one they said they could do, and a
 * person who asked for mornings does not want a call about half past four.
 *
 * @param {object} entry  waitlist document
 * @param {object} slot   { date, time|startMin, endMin|duration, staffId }
 * @param {string} today
 * @returns {{ok:boolean, reason?:string}}
 */
export function matchesSlot(entry, slot, today) {
  if (!entry || !slot) return { ok: false, reason: 'sem-dados' };
  if ((entry.status || 'waiting') !== 'waiting') return { ok: false, reason: 'ja-tratado' };
  if (!entry.phoneE164) return { ok: false, reason: 'sem-telemovel' };
  if (today && slot.date < today) return { ok: false, reason: 'no-passado' };

  if (entry.fromDate && slot.date < entry.fromDate) return { ok: false, reason: 'antes-da-janela' };
  if (entry.toDate && slot.date > entry.toDate) return { ok: false, reason: 'depois-da-janela' };

  const part = entry.partOfDay || 'any';
  const start = startOf(slot);
  if (part === 'morning' && start >= NOON) return { ok: false, reason: 'queria-de-manha' };
  if (part === 'afternoon' && start < NOON) return { ok: false, reason: 'queria-de-tarde' };

  if (entry.staffId && slot.staffId && entry.staffId !== slot.staffId) return { ok: false, reason: 'outro-colaborador' };

  const room = lengthOf(slot);
  if (room && entry.duration && entry.duration > room) return { ok: false, reason: 'nao-cabe' };

  return { ok: true };
}

/**
 * Who to call first, best first.
 *
 * Order of what matters: somebody who asked for this exact person, then
 * whoever has been waiting longest — a queue that ignores waiting time stops
 * being a queue and the salon stops trusting it.
 */
export function rankCandidates(entries, slot, today, { cooldownDays = OFFER_COOLDOWN_DAYS } = {}) {
  return (entries || [])
    .map(e => ({ entry: e, m: matchesSlot(e, slot, today) }))
    .filter(x => x.m.ok)
    .filter(x => {
      // Do not pester the same person about a slot every other day.
      const last = x.entry.lastOfferedDate;
      return !last || !today || daysBetween(last, today) >= cooldownDays;
    })
    .map(x => {
      const exactStaff = !!(x.entry.staffId && slot.staffId && x.entry.staffId === slot.staffId);
      const waited = x.entry.createdDate && today ? Math.max(0, daysBetween(x.entry.createdDate, today)) : 0;
      return { ...x.entry, _exactStaff: exactStaff, _waited: waited };
    })
    .sort((a, b) => (b._exactStaff - a._exactStaff) || (b._waited - a._waited) || String(a.name || '').localeCompare(String(b.name || '')));
}

/** Entries whose window has already passed — nothing left to offer them. */
export function staleEntries(entries, today) {
  return (entries || []).filter(e => (e.status || 'waiting') === 'waiting' && e.toDate && e.toDate < today);
}

/** A short line for the panel: what this person is waiting for. */
export function describeWant(entry) {
  const when = entry.fromDate === entry.toDate
    ? dateLabelPT(entry.fromDate)
    : `${dateLabelPT(entry.fromDate)} a ${dateLabelPT(entry.toDate)}`;
  const part = PART_OF_DAY[entry.partOfDay || 'any'];
  const who = entry.staffName ? ` com ${entry.staffName}` : '';
  return `${entry.serviceName}${who} · ${when}, ${part}`;
}

/**
 * The message the salon sends. Says the time first, because that is the only
 * thing the person has to decide about, and does not pretend the slot is held.
 */
export function offerMessage({ entry, slot, salonName, link }) {
  const n = firstName(entry.name);
  const hi = n ? `Olá ${n}! ` : 'Olá! ';
  const when = `${dateLabelPT(slot.date)} às ${slot.time}`;
  const tail = link ? `\nMarca aqui: ${link}` : '\nResponde a esta mensagem se quiseres.';
  return `${hi}Aqui é do ${salonName} 👋 Abriu uma vaga para *${entry.serviceName}* em *${when}*`
    + `${slot.staffName ? ` com ${slot.staffName}` : ''}. Ainda queres?`
    + `${tail}\n(É por ordem de chegada — avisámos mais alguém.)`;
}

/** Counts for the panel header. */
export function waitlistSummary(entries, today) {
  const list = entries || [];
  const waiting = list.filter(e => (e.status || 'waiting') === 'waiting');
  return {
    total: list.length,
    waiting: waiting.length,
    stale: staleEntries(list, today).length,
    offered: list.filter(e => e.status === 'offered').length,
    booked: list.filter(e => e.status === 'booked').length,
    reachable: waiting.filter(e => e.phoneE164).length,
    value: waiting.reduce((a, e) => a + (Number(e.price) || 0), 0),
  };
}
