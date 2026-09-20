/* The waitlist, end to end against the real project.
 *
 * Someone finds the day full and asks to be told → the salon cancels a booking
 * → the right person comes up first → they are offered it once, not twice →
 * and none of this is readable by anyone but the salon.
 *
 *   node --import ./tests/_register.mjs tests/waitlist.e2e.mjs
 */
import {
  db, auth, doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, query, where,
  signInWithEmailAndPassword, signOut,
} from '../firebase.js';
import {
  loadSalon, loadBookingContext, createBooking, cancelBooking, agendaId, addDaysStr, todayForSalon,
  joinWaitlist, loadWaitlist, markWaitlistOffered, setWaitlistStatus, removeWaitlistEntry,
  freedSlotFrom, waitlistBookingLink,
} from '../app.js';
import { rankCandidates, matchesSlot, offerMessage, waitlistSummary } from '../waitlist-core.js';

const E = process.env;
const SALON = E.SALON_ID || 'demo';
const ADMIN = { email: E.ADMIN_EMAIL || 'admin@bookit.demo', pw: E.ADMIN_PASSWORD || 'Demo2026!' };

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${d}`); } };
const attempt = async (fn) => { try { const v = await fn(); return { allowed: true, v }; } catch (e) { return { allowed: false, code: e.code || e.message }; } };
const refused = (n, r) => ok(n, !r.allowed, '(foi permitido)');

const salon = await loadSalon(SALON);
const today = todayForSalon(salon);
const DAY = addDaysStr(today, 30 + (Date.now() % 20));   // a different day per run
const made = { bookings: [], waitlist: [] };

await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
const ctx = await loadBookingContext(SALON);
const S = ctx.staff[0], S2 = ctx.staff[1] || S;
const svcs = (await getDocs(collection(db, 'salons', SALON, 'services'))).docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.active !== false);
const shortSvc = svcs.slice().sort((a, b) => a.duration - b.duration)[0];
const longSvc = svcs.slice().sort((a, b) => b.duration - a.duration)[0];
console.log(`\nWaitlist E2E — ${salon.name} · ${DAY} · curto "${shortSvc.name}" (${shortSvc.duration}min) · longo "${longSvc.name}" (${longSvc.duration}min)\n`);

/* ── anyone may join, without signing in ───────────────────────────────── */
await signOut(auth);
const join = async (over) => {
  const r = await joinWaitlist({
    salonId: SALON, salon, services: [shortSvc], staff: null,
    client: { name: 'WL-TEST Pessoa', phone: '919 000 601', email: '', notes: '' },
    fromDate: DAY, toDate: addDaysStr(DAY, 7), partOfDay: 'any', ...over,
  });
  made.waitlist.push(r.id);
  return r.id;
};
const anyone = await attempt(() => join({}));
ok('uma visitante entra na lista sem conta', anyone.allowed, anyone.code);

const noPhone = await attempt(() => join({ client: { name: 'WL-TEST Sem Telefone', phone: 'abc', email: '', notes: '' } }));
ok('sem telemóvel válido é recusada', !noPhone.allowed && noPhone.code === 'invalid-phone', noPhone.code);
const badDates = await attempt(() => join({ fromDate: addDaysStr(DAY, 5), toDate: DAY }));
ok('datas ao contrário são recusadas', !badDates.allowed && badDates.code === 'invalid-date', badDates.code);
const tooFar = await attempt(() => join({ toDate: addDaysStr(today, 400) }));
ok('para além da antecedência máxima é recusada', !tooFar.allowed, tooFar.code);

/* ── the queue carries names and phones: it is not public ──────────────── */
refused('a fila não é legível sem sessão', await attempt(() => getDocs(collection(db, 'salons', SALON, 'waitlist'))));
refused('nem se sabe o id de uma entrada', await attempt(() => getDoc(doc(db, 'salons', SALON, 'waitlist', made.waitlist[0]))));
refused('uma visitante não tira ninguém da lista', await attempt(() => deleteDoc(doc(db, 'salons', SALON, 'waitlist', made.waitlist[0]))));
refused('nem se promove a si própria a já marcada', await attempt(() => updateDoc(doc(db, 'salons', SALON, 'waitlist', made.waitlist[0]), { status: 'booked' })));

/* ── three people with different wants ─────────────────────────────────── */
const idAny      = made.waitlist[0];                                              // qualquer hora, qualquer pessoa
const idMorning  = await join({ client: { name: 'WL-TEST Manha', phone: '919 000 602', email: '', notes: '' }, partOfDay: 'morning' });
const idAfter    = await join({ client: { name: 'WL-TEST Tarde', phone: '919 000 603', email: '', notes: '' }, partOfDay: 'afternoon' });
const idOtherDay = await join({ client: { name: 'WL-TEST OutroDia', phone: '919 000 604', email: '', notes: '' }, fromDate: addDaysStr(DAY, 20), toDate: addDaysStr(DAY, 25) });
const idLong     = await join({ client: { name: 'WL-TEST Longo', phone: '919 000 605', email: '', notes: '' }, services: [longSvc] });
const idPicky    = await join({ client: { name: 'WL-TEST SoS2', phone: '919 000 606', email: '', notes: '' }, staff: S2 });

/* ── a booking is made, then cancelled: who wanted it? ─────────────────── */
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
const booking = await createBooking({
  salonId: SALON, salon, ctx, service: shortSvc, staff: S, dateStr: DAY, startMin: 10 * 60,
  client: { id: null, name: 'WL-TEST Quem Cancela', email: '', phone: '919 000 600' },
  discount: null, source: 'admin', status: 'confirmed',
});
made.bookings.push(booking.id);
const bSnap = (await getDoc(doc(db, 'salons', SALON, 'bookings', booking.id))).data();
await cancelBooking({ salonId: SALON, bookingId: booking.id, by: 'admin' });

const slot = freedSlotFrom(bSnap);
ok('o horário libertado tem data, hora e colaborador', slot.date === DAY && !!slot.time && slot.staffId === S.id, JSON.stringify(slot));

const list = (await loadWaitlist(SALON)).filter(e => String(e.name || '').startsWith('WL-TEST'));
ok('o salão lê a fila', list.length >= 6, `(${list.length})`);

const ranked = rankCandidates(list, slot, today);
const names = ranked.map(r => r.name);
ok('quem quer de manhã aparece para um horário das 10h', names.includes('WL-TEST Manha'), names.join(', '));
ok('quem só quer de tarde NÃO aparece', !names.includes('WL-TEST Tarde'), names.join(', '));
ok('quem só pode noutras datas NÃO aparece', !names.includes('WL-TEST OutroDia'), names.join(', '));
ok('quem pediu outro colaborador NÃO aparece', S2.id === S.id || !names.includes('WL-TEST SoS2'), names.join(', '));
ok('quem quer a qualquer hora aparece', names.includes('WL-TEST Pessoa'), names.join(', '));
const longFits = longSvc.duration <= (slot.endMin - slot.startMin);
ok(`serviço longo ${longFits ? 'cabe e aparece' : 'não cabe e fica de fora'}`, names.includes('WL-TEST Longo') === longFits, names.join(', '));

/* ── the message is ready to send, and honest ──────────────────────────── */
const first = ranked[0];
const link = waitlistBookingLink({ salonId: SALON, slot });
const msg = offerMessage({ entry: first, slot, salonName: salon.name, link });
ok('a mensagem tem a hora, o serviço e o link', msg.includes(slot.time) && msg.includes(first.serviceName) && msg.includes(link), msg.slice(0, 80));
ok('e o link leva ao dia certo', link.includes(`date=${DAY}`) && link.includes('src=lista-espera'));

/* ── offered once, not every day ───────────────────────────────────────── */
await markWaitlistOffered({ salonId: SALON, entryId: first.id, slot, today });
const after = (await loadWaitlist(SALON)).filter(e => String(e.name || '').startsWith('WL-TEST'));
const nudged = after.find(e => e.id === first.id);
ok('fica registado que já foi avisada', nudged.lastOfferedDate === today && nudged.offerCount >= 1, JSON.stringify({ d: nudged.lastOfferedDate, n: nudged.offerCount }));
ok('e deixa de aparecer nos candidatos de hoje', !rankCandidates(after, slot, today).some(r => r.id === first.id));
ok('mas volta a aparecer daqui a uns dias', rankCandidates(after, slot, addDaysStr(today, 5)).some(r => r.id === first.id));

/* ── resolving and tidying ─────────────────────────────────────────────── */
await setWaitlistStatus({ salonId: SALON, entryId: idMorning, status: 'booked' });
const resolved = (await loadWaitlist(SALON)).filter(e => String(e.name || '').startsWith('WL-TEST'));
ok('quem marcou sai da fila de candidatos', !rankCandidates(resolved, slot, addDaysStr(today, 10)).some(r => r.id === idMorning));
const sum = waitlistSummary(resolved, today);
ok('o resumo conta quem está à espera e quem já marcou', sum.booked >= 1 && sum.waiting >= 3, JSON.stringify(sum));

await removeWaitlistEntry({ salonId: SALON, entryId: idAfter });
made.waitlist = made.waitlist.filter(x => x !== idAfter);
ok('o salão tira alguém da lista', !(await getDoc(doc(db, 'salons', SALON, 'waitlist', idAfter))).exists());

/* ── cleanup ───────────────────────────────────────────────────────────── */
console.log('\n— limpeza —');
for (const id of made.waitlist) await deleteDoc(doc(db, 'salons', SALON, 'waitlist', id)).catch(() => {});
for (const d of (await getDocs(collection(db, 'salons', SALON, 'waitlist'))).docs) {
  if (String(d.data().name || '').startsWith('WL-TEST')) await deleteDoc(d.ref).catch(() => {});
}
for (const id of made.bookings) {
  const s = await getDoc(doc(db, 'salons', SALON, 'bookings', id));
  if (!s.exists()) continue;
  const b = s.data();
  if (b.manageToken) await deleteDoc(doc(db, 'salons', SALON, 'bookingLinks', b.manageToken)).catch(() => {});
  await deleteDoc(s.ref);
}
for (const d of (await getDocs(query(collection(db, 'salons', SALON, 'bookings'), where('clientName', '==', 'WL-TEST Quem Cancela')))).docs) await deleteDoc(d.ref).catch(() => {});
await signOut(auth);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
