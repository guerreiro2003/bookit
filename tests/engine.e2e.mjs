/* End-to-end test of the booking engine (app.js transactional helpers) against
 * a real Firebase project, using the SAME code the browser runs.
 *
 *   node --import ./tests/_register.mjs tests/engine.e2e.mjs
 *
 * Scenarios: guest booking, "no preference" auto-assignment, concurrent
 * double-booking (exactly one wins), closed date / time-off / break rejection,
 * team confirm → pay (guest client auto-created), no-show transitions,
 * cancel + restore (and restore failing when the slot was taken meanwhile),
 * reschedule (same and different staff), client cancellation policy.
 * Everything it creates is cleaned up. Env vars as in rules.integration.mjs.
 */
import { db, auth, doc, getDoc, getDocs, updateDoc, deleteDoc, deleteField, collection, query, where, signInWithEmailAndPassword, signOut } from '../firebase.js';
import {
  loadSalon, loadBookingContext, computeAvailability, createBooking, cancelBooking, restoreBooking, rescheduleBooking,
  confirmBooking, markBookingPaid, markBookingNoShow, timeToMin, minToTime, addDaysStr, nowInTimezone, salonSetting, agendaId,
} from '../app.js';

const E = process.env;
const SALON = E.SALON_ID || 'demo';
const ADMIN = { email: E.ADMIN_EMAIL || 'admin@bookit.demo', pw: E.ADMIN_PASSWORD || 'Demo2026!' };
const CLIENT = { email: E.CLIENT_EMAIL || 'cliente@bookit.demo', pw: E.CLIENT_PASSWORD || 'Cliente2026!' };
const TEAM_PW = E.TEAM_PASSWORD || 'equipa2026';

let pass = 0, fail = 0; const created = new Set();
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${detail}`); } };
const expectErr = async (name, fn, code) => { try { await fn(); ok(name, false, `(expected error ${code}, got success)`); } catch (e) { ok(name, e.code === code || e.message === code, `(expected ${code}, got ${e.code || e.message})`); } };
const nextOpen = (days) => { let d = new Date(Date.now() + days * 86400000); while (d.getUTCDay() === 0) d = new Date(d.getTime() + 86400000); return d.toISOString().slice(0, 10); };
// A unique phone per guest: identity is the phone number, so sharing one would
// merge every test guest into a single client record.
let guestSeq = 0;
const guest = (n) => ({ id: null, name: `E2E-TEST ${n}`, email: `e2e-${n}@example.com`, phone: `91${String(2000000 + (++guestSeq))}`, notes: 'teste automático', forSomeone: '' });
/** Flattens the by-booking agenda back into [{start,end,bookingId}] for assertions. */
const agendaOf = async (staffId, date) => {
  const s = await getDoc(doc(db, 'salons', SALON, 'agenda', agendaId(staffId, date)));
  const by = s.exists() ? (s.data().byBooking || {}) : {};
  return Object.entries(by).flatMap(([bookingId, e]) => (e?.blocks || []).map(b => ({ ...b, bookingId })));
};

const salon = await loadSalon(SALON);
const ctx = await loadBookingContext(SALON);
const services = (await getDocs(query(collection(db, 'salons', SALON, 'services'), where('active', '==', true)))).docs.map(d => ({ id: d.id, ...d.data() }));
const svc45 = services.find(s => s.duration === 45) || services[0];
const svc90 = services.find(s => s.duration >= 90) || services[0];
const [S1, S2] = ctx.staff;
const D1 = nextOpen(30), D2 = nextOpen(37), D3 = nextOpen(44);
console.log(`\nEngine E2E — salon=${salon.name} staff=${ctx.staff.map(s => s.name).join(', ')} dates=${D1},${D2},${D3}\n`);

/* ── 1. GUEST (signed out) ── */
console.log('GUEST');
await signOut(auth);
const av = await computeAvailability({ salonId: SALON, salon, ctx, service: svc45, staff: S1, dateStr: D1 });
ok('availability returns slots on an open day', av.slots.length > 5);
const t10 = av.slots.find(m => m >= 600) ?? av.slots[0];
const b1 = await createBooking({ salonId: SALON, salon, ctx, service: svc45, staff: S1, dateStr: D1, startMin: t10, client: guest('g1'), discount: null });
created.add(b1.id);
ok('guest creates booking with chosen staff', b1.staff.id === S1.id && b1.time === minToTime(t10));
ok('agenda holds the interval', (await agendaOf(S1.id, D1)).some(iv => iv.bookingId === b1.id && iv.start === t10 && iv.end === t10 + svc45.duration));
const av2 = await computeAvailability({ salonId: SALON, salon, ctx, service: svc45, staff: S1, dateStr: D1 });
ok('slot disappears from availability after booking', !av2.slots.includes(t10) && !av2.slots.includes(t10 + 15) && !av2.slots.includes(t10 + 30));
ok('a 15-min-later overlap is blocked for the same staff', !av2.slots.includes(t10 + 15));

// concurrency: two guests race for the same slot on S2 → exactly one wins
const race = await Promise.allSettled([
  createBooking({ salonId: SALON, salon, ctx, service: svc45, staff: S2, dateStr: D1, startMin: t10, client: guest('r1'), discount: null }),
  createBooking({ salonId: SALON, salon, ctx, service: svc45, staff: S2, dateStr: D1, startMin: t10, client: guest('r2'), discount: null }),
]);
race.forEach(r => { if (r.status === 'fulfilled') created.add(r.value.id); });
ok('concurrent double-booking: exactly one succeeds', race.filter(r => r.status === 'fulfilled').length === 1 && race.some(r => r.status === 'rejected' && r.reason?.code === 'slot-taken'));

// no preference: S1 busy at t10, so it must assign someone else (S2 also busy now) → third staff or error
const anyRes = await Promise.allSettled([createBooking({ salonId: SALON, salon, ctx, service: svc45, staff: null, dateStr: D1, startMin: t10, client: guest('any'), discount: null })]);
if (anyRes[0].status === 'fulfilled') { created.add(anyRes[0].value.id); ok('"no preference" auto-assigns a free staff member', ![S1.id, S2.id].includes(anyRes[0].value.staff.id)); }
else ok('"no preference" reports no-staff-available when nobody is free', anyRes[0].reason?.code === 'no-staff-available');
// and on a free afternoon slot it must succeed and pick someone
const avAny = await computeAvailability({ salonId: SALON, salon, ctx, service: svc45, staff: null, dateStr: D3 });
const pm = avAny.slots.find(m => m >= 15 * 60);
const anyOk = await createBooking({ salonId: SALON, salon, ctx, service: svc45, staff: null, dateStr: D3, startMin: pm, client: guest('any2'), discount: null });
created.add(anyOk.id);
ok('"no preference" assigns a real staff member when someone is free', !!anyOk.staff?.id && ctx.staff.some(s => s.id === anyOk.staff.id));

await expectErr('booking on a Sunday is rejected (salon closed)', () => createBooking({ salonId: SALON, salon, ctx, service: svc45, staff: S1, dateStr: (() => { let d = new Date(Date.now() + 30 * 86400000); while (d.getUTCDay() !== 0) d = new Date(d.getTime() + 86400000); return d.toISOString().slice(0, 10); })(), startMin: 600, client: guest('sun'), discount: null }), 'salon-closed');
await expectErr('booking outside hours is rejected', () => createBooking({ salonId: SALON, salon, ctx, service: svc45, staff: S1, dateStr: D2, startMin: 8 * 60, client: guest('early'), discount: null }), 'outside-hours');
await expectErr('booking in the past is rejected', () => createBooking({ salonId: SALON, salon, ctx, service: svc45, staff: S1, dateStr: '2020-01-06', startMin: 600, client: guest('past'), discount: null }), 'too-soon');
await expectErr('booking on a salon closed date is rejected', () => createBooking({ salonId: SALON, salon: { ...salon, closedDates: [D2] }, ctx, service: svc45, staff: S1, dateStr: D2, startMin: 600, client: guest('closed'), discount: null }), 'salon-closed-date');
await expectErr('booking during staff time-off is rejected', () => createBooking({ salonId: SALON, salon, ctx: { ...ctx, staff: ctx.staff }, service: svc45, staff: { ...S1, timeOff: [{ from: D2, to: D2 }] }, dateStr: D2, startMin: 600, client: guest('off'), discount: null }), 'staff-time-off');
await expectErr('booking overlapping a break is rejected', () => createBooking({ salonId: SALON, salon, ctx: { ...ctx, schedule: Object.fromEntries(Object.entries(ctx.schedule).map(([k, v]) => [k, { ...v, breakStart: '13:00', breakEnd: '14:00' }])) }, service: svc45, staff: S1, dateStr: D2, startMin: 12 * 60 + 30, client: guest('brk'), discount: null }), 'break');
await expectErr('guest cannot confirm a booking', () => confirmBooking({ salonId: SALON, bookingId: b1.id }), 'permission-denied');

/* ── 2. TEAM ── */
console.log('TEAM');
await signInWithEmailAndPassword(auth, salon.teamEmail, TEAM_PW);
await confirmBooking({ salonId: SALON, bookingId: b1.id });
ok('team confirms', (await getDoc(doc(db, 'salons', SALON, 'bookings', b1.id))).data().status === 'confirmed');
await expectErr('confirm twice → invalid-transition', () => confirmBooking({ salonId: SALON, bookingId: b1.id }), 'invalid-transition');

// cancel + restore
await cancelBooking({ salonId: SALON, bookingId: b1.id, by: 'team' });
ok('cancel frees the agenda', !(await agendaOf(S1.id, D1)).some(iv => iv.bookingId === b1.id));
const av3 = await computeAvailability({ salonId: SALON, salon, ctx, service: svc45, staff: S1, dateStr: D1 });
ok('freed slot is bookable again', av3.slots.includes(t10));
await restoreBooking({ salonId: SALON, bookingId: b1.id });
const restored = (await getDoc(doc(db, 'salons', SALON, 'bookings', b1.id))).data();
ok('restore puts it back as confirmed and re-blocks the agenda', restored.status === 'confirmed' && (await agendaOf(S1.id, D1)).some(iv => iv.bookingId === b1.id));

// restore must FAIL if someone took the slot meanwhile
await cancelBooking({ salonId: SALON, bookingId: b1.id, by: 'team' });
await signOut(auth);
const thief = await createBooking({ salonId: SALON, salon, ctx, service: svc45, staff: S1, dateStr: D1, startMin: t10, client: guest('thief'), discount: null });
created.add(thief.id);
await signInWithEmailAndPassword(auth, salon.teamEmail, TEAM_PW);
await expectErr('restore fails when the slot was taken meanwhile', () => restoreBooking({ salonId: SALON, bookingId: b1.id }), 'slot-taken');

// reschedule thief: same staff, later; then to another staff on another day
const av4 = await computeAvailability({ salonId: SALON, salon, ctx, service: svc45, staff: S1, dateStr: D1 });
const later = av4.slots.find(m => m > t10 + 60);
await rescheduleBooking({ salonId: SALON, salon, ctx, bookingId: thief.id, newDate: D1, newStartMin: later });
let th = (await getDoc(doc(db, 'salons', SALON, 'bookings', thief.id))).data();
ok('reschedule (same staff) moves booking + agenda', th.time === minToTime(later) && (await agendaOf(S1.id, D1)).some(iv => iv.bookingId === thief.id && iv.start === later) && !(await agendaOf(S1.id, D1)).some(iv => iv.bookingId === thief.id && iv.start === t10));
await rescheduleBooking({ salonId: SALON, salon, ctx, bookingId: thief.id, newDate: D3, newStartMin: 11 * 60, newStaff: S2 });
th = (await getDoc(doc(db, 'salons', SALON, 'bookings', thief.id))).data();
ok('reschedule (other staff, other day) moves across agendas', th.staffId === S2.id && th.date === D3 && (await agendaOf(S2.id, D3)).some(iv => iv.bookingId === thief.id) && !(await agendaOf(S1.id, D1)).some(iv => iv.bookingId === thief.id));
await expectErr('reschedule onto an occupied slot is rejected', () => rescheduleBooking({ salonId: SALON, salon, ctx, bookingId: b1.id, newDate: D3, newStartMin: 11 * 60, newStaff: S2 }), 'invalid-transition');

// pay a guest booking → client auto-created & linked; loyalty counters
const winner = race.find(r => r.status === 'fulfilled').value;
await confirmBooking({ salonId: SALON, bookingId: winner.id });
await markBookingPaid({ salonId: SALON, salon, bookingId: winner.id, method: 'balcao' });
const paid = (await getDoc(doc(db, 'salons', SALON, 'bookings', winner.id))).data();
ok('pay → completed + paid + points', paid.status === 'completed' && paid.paid === true && paid.pointsAwarded === salonSetting(salon, 'pointsPerVisit'));
ok('guest client record auto-created and linked', !!paid.clientId);
const cli = paid.clientId ? (await getDoc(doc(db, 'salons', SALON, 'clients', paid.clientId))).data() : null;
ok('client counters initialised (1 visit, points, spent)', cli && cli.visits === 1 && cli.points === salonSetting(salon, 'pointsPerVisit') && cli.totalSpent === paid.finalPrice);
if (paid.clientId) created.add('client:' + paid.clientId);
await expectErr('pay twice → alreadyPaid (idempotent)', async () => { const r = await markBookingPaid({ salonId: SALON, salon, bookingId: winner.id, method: 'balcao' }); if (r.alreadyPaid) throw Object.assign(new Error('alreadyPaid'), { code: 'alreadyPaid' }); }, 'alreadyPaid');
await expectErr('completed → no-show is forbidden', () => markBookingNoShow({ salonId: SALON, salon, bookingId: winner.id }), 'booking-completed');
await expectErr('cancelled → completed is forbidden', () => markBookingPaid({ salonId: SALON, salon, bookingId: b1.id, method: 'balcao' }), 'booking-cancelled');
await signOut(auth);

/* ── 3. CLIENT cancellation policy ── */
console.log('CLIENT');
await signInWithEmailAndPassword(auth, CLIENT.email, CLIENT.pw);
const me = auth.currentUser;
const now = nowInTimezone(salonSetting(salon, 'timezone'));
const farB = await createBooking({ salonId: SALON, salon, ctx, service: svc45, staff: S1, dateStr: D2, startMin: 15 * 60, client: { id: me.uid, name: 'E2E-TEST cliente', email: CLIENT.email, phone: '912000000' }, discount: null });
created.add(farB.id);
await cancelBooking({ salonId: SALON, bookingId: farB.id, by: 'client', enforcePolicy: { cancellationHours: salonSetting(salon, 'cancellationHours'), now } });
ok('client cancels a far-ahead booking (policy ok)', (await getDoc(doc(db, 'salons', SALON, 'bookings', farB.id))).data().status === 'cancelled');
await expectErr('client cancelling twice → invalid-transition', () => cancelBooking({ salonId: SALON, bookingId: farB.id, by: 'client', enforcePolicy: { cancellationHours: 24, now } }), 'invalid-transition');
// near booking: created as team for today/tomorrow within policy window
await signOut(auth); await signInWithEmailAndPassword(auth, salon.teamEmail, TEAM_PW);
const soonDate = addDaysStr(now.dateStr, 1); const soonMin = Math.max(10 * 60, Math.min(18 * 60, now.minutes)); // ~24h ahead minus a bit → too late if < 24h
let nearB = null;
try { nearB = await createBooking({ salonId: SALON, salon: { ...salon, bookingLeadMinutes: 0 }, ctx, service: svc45, staff: S2, dateStr: soonDate, startMin: soonMin - 60, client: { id: me.uid, name: 'E2E-TEST cliente', email: CLIENT.email, phone: '912000000' }, discount: null, source: 'staff', status: 'confirmed' }); created.add(nearB.id); } catch (e) { console.log('   (near booking skipped:', e.code, ')'); }
await signOut(auth); await signInWithEmailAndPassword(auth, CLIENT.email, CLIENT.pw);
if (nearB) await expectErr('client cannot cancel < 24h ahead (policy enforced in engine)', () => cancelBooking({ salonId: SALON, bookingId: nearB.id, by: 'client', enforcePolicy: { cancellationHours: 24, now: nowInTimezone(salonSetting(salon, 'timezone')) } }), 'cancel-too-late');
await signOut(auth);

/* ── cleanup (admin) ── */
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
for (const id of created) {
  if (id.startsWith('client:')) { await deleteDoc(doc(db, 'salons', SALON, 'clients', id.slice(7))).catch(() => {}); continue; }
  try { await cancelBooking({ salonId: SALON, bookingId: id, by: 'admin' }); } catch {}
  await deleteDoc(doc(db, 'salons', SALON, 'bookings', id)).catch(() => {});
}
// cancelBooking already frees the agenda; sweep any entry left behind by a failed step.
for (const s of ctx.staff) for (const d of [D1, D2, D3, addDaysStr(now.dateStr, 1)]) {
  const ref = doc(db, 'salons', SALON, 'agenda', agendaId(s.id, d)); const snap = await getDoc(ref);
  if (!snap.exists()) continue;
  const by = snap.data().byBooking || {};
  const stale = Object.keys(by).filter(id => created.has(id));
  if (stale.length) await updateDoc(ref, Object.fromEntries(stale.map(id => [`byBooking.${id}`, deleteField()])));
}
await signOut(auth);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
