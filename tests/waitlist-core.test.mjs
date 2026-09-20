import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesSlot, rankCandidates, staleEntries, describeWant, offerMessage, waitlistSummary, NOON,
} from '../waitlist-core.js';

const TODAY = '2026-09-20';
const entry = (over = {}) => ({
  name: 'Maria Silva', phone: '912 345 678', phoneE164: '351912345678',
  serviceIds: ['corte'], serviceName: 'Corte + Brushing', duration: 45, price: 35,
  staffId: null, staffName: '', fromDate: '2026-09-21', toDate: '2026-09-27',
  partOfDay: 'any', status: 'waiting', createdDate: '2026-09-18', ...over,
});
/** endMin follows startMin unless the test says otherwise — a slot that ends
 *  before it starts is not a case worth testing, it is a broken fixture. */
const slot = ({ startMin = 600, minutes = 60, ...over } = {}) => ({
  date: '2026-09-24', time: '10:00', startMin, endMin: startMin + minutes,
  staffId: 'ana', staffName: 'Ana', ...over,
});

test('a slot inside the window, long enough, matches', () => {
  assert.deepEqual(matchesSlot(entry(), slot(), TODAY), { ok: true });
});

test('outside the days she gave, it does not', () => {
  assert.equal(matchesSlot(entry(), slot({ date: '2026-09-20' }), TODAY).reason, 'antes-da-janela');
  assert.equal(matchesSlot(entry(), slot({ date: '2026-10-02' }), TODAY).reason, 'depois-da-janela');
});

test('morning means morning', () => {
  const m = entry({ partOfDay: 'morning' });
  assert.equal(matchesSlot(m, slot({ startMin: 10 * 60 }), TODAY).ok, true);
  assert.equal(matchesSlot(m, slot({ startMin: 16 * 60 }), TODAY).reason, 'queria-de-manha');
  const t = entry({ partOfDay: 'afternoon' });
  assert.equal(matchesSlot(t, slot({ startMin: 16 * 60 }), TODAY).ok, true);
  assert.equal(matchesSlot(t, slot({ startMin: 10 * 60 }), TODAY).reason, 'queria-de-tarde');
  // the boundary is lunch, and 13:00 counts as afternoon
  assert.equal(matchesSlot(t, slot({ startMin: NOON }), TODAY).ok, true);
  assert.equal(matchesSlot(m, slot({ startMin: NOON }), TODAY).reason, 'queria-de-manha');
});

test('a service that does not fit the gap is not offered', () => {
  const long = entry({ duration: 90 });
  assert.equal(matchesSlot(long, slot({ minutes: 60 }), TODAY).reason, 'nao-cabe');
  assert.equal(matchesSlot(long, slot({ minutes: 150 }), TODAY).ok, true);
});

test('asking for one person means only that person', () => {
  const picky = entry({ staffId: 'ana', staffName: 'Ana' });
  assert.equal(matchesSlot(picky, slot({ staffId: 'ana' }), TODAY).ok, true);
  assert.equal(matchesSlot(picky, slot({ staffId: 'rui' }), TODAY).reason, 'outro-colaborador');
  // "no preference" takes whoever
  assert.equal(matchesSlot(entry(), slot({ staffId: 'rui' }), TODAY).ok, true);
});

test('nobody is called about a slot in the past, or without a phone, or twice', () => {
  assert.equal(matchesSlot(entry(), slot({ date: '2026-09-19' }), TODAY).reason, 'no-passado');
  assert.equal(matchesSlot(entry({ phoneE164: null }), slot(), TODAY).reason, 'sem-telemovel');
  assert.equal(matchesSlot(entry({ status: 'booked' }), slot(), TODAY).reason, 'ja-tratado');
  assert.equal(matchesSlot(entry({ status: 'offered' }), slot(), TODAY).reason, 'ja-tratado');
});

test('the queue calls the right person first', () => {
  const list = [
    entry({ name: 'Recente', createdDate: '2026-09-19' }),
    entry({ name: 'Antiga',  createdDate: '2026-09-01' }),
    entry({ name: 'Pediu a Ana', staffId: 'ana', staffName: 'Ana', createdDate: '2026-09-19' }),
  ];
  const r = rankCandidates(list, slot({ staffId: 'ana' }), TODAY);
  assert.deepEqual(r.map(x => x.name), ['Pediu a Ana', 'Antiga', 'Recente'],
    'quem pediu esta pessoa primeiro, depois quem espera há mais tempo');
});

test('a queue that ignores waiting time is not a queue', () => {
  const list = [entry({ name: 'Ontem', createdDate: '2026-09-19' }), entry({ name: 'Há um mês', createdDate: '2026-08-20' })];
  assert.deepEqual(rankCandidates(list, slot(), TODAY).map(x => x.name), ['Há um mês', 'Ontem']);
});

test('the same person is not pestered every other day', () => {
  const nudged = entry({ name: 'Já avisada', lastOfferedDate: '2026-09-19' });
  assert.equal(rankCandidates([nudged], slot(), TODAY).length, 0, 'avisada ontem — fica de fora');
  const older = entry({ name: 'Avisada há uma semana', lastOfferedDate: '2026-09-12' });
  assert.equal(rankCandidates([older], slot(), TODAY).length, 1);
});

test('entries whose window has passed are flagged, not silently kept', () => {
  const list = [entry({ name: 'Passou', toDate: '2026-09-15' }), entry({ name: 'Ainda dá' })];
  assert.deepEqual(staleEntries(list, TODAY).map(x => x.name), ['Passou']);
});

test('what she is waiting for, in one readable line', () => {
  const one = describeWant(entry({ fromDate: '2026-09-24', toDate: '2026-09-24', partOfDay: 'morning' }));
  assert.match(one, /Corte \+ Brushing/);
  assert.match(one, /de manhã/);
  assert.ok(!one.includes(' a '), 'um único dia não se escreve como intervalo');
  const range = describeWant(entry({ staffId: 'ana', staffName: 'Ana' }));
  assert.match(range, /com Ana/);
});

test('the message leads with the time and does not promise the slot is held', () => {
  const msg = offerMessage({ entry: entry(), slot: slot(), salonName: 'Zen Organic', link: 'https://x/?s=1' });
  assert.match(msg, /Maria/);
  assert.match(msg, /10:00/);
  assert.match(msg, /Corte \+ Brushing/);
  assert.match(msg, /https:\/\/x\/\?s=1/);
  assert.match(msg, /ordem de chegada/, 'é honesto dizer que avisámos mais alguém');
});

test('the summary counts what the panel header shows', () => {
  const list = [
    entry(), entry({ status: 'offered' }), entry({ status: 'booked' }),
    entry({ toDate: '2026-09-01' }), entry({ phoneE164: null }),
  ];
  const s = waitlistSummary(list, TODAY);
  assert.equal(s.total, 5);
  assert.equal(s.waiting, 3, 'à espera: as duas normais mais a que passou do prazo');
  assert.equal(s.offered, 1);
  assert.equal(s.booked, 1);
  assert.equal(s.stale, 1);
  assert.equal(s.reachable, 2, 'a que não tem telemóvel não é contactável');
  assert.equal(s.value, 105);
});

test('empty and malformed input never throws', () => {
  assert.equal(matchesSlot(null, slot(), TODAY).ok, false);
  assert.equal(matchesSlot(entry(), null, TODAY).ok, false);
  assert.deepEqual(rankCandidates(null, slot(), TODAY), []);
  assert.deepEqual(staleEntries(null, TODAY), []);
  assert.equal(waitlistSummary(null, TODAY).total, 0);
});
