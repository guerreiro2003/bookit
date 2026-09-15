/* E2E for capability links (m.html flows) against the real project:
 * guest creates booking → link doc exists (no PII) → confirm by token
 * (wrong token denied) → cancel by token releases the agenda → policy window
 * enforced → link holder cannot escalate (completed) → cleanup.
 *
 *   node --import ./tests/_register.mjs tests/links.e2e.mjs
 */
import { db, auth, doc, getDoc, updateDoc, deleteDoc, signInWithEmailAndPassword, signOut } from '../firebase.js';
import { loadSalon, loadBookingContext, computeAvailability, createBooking, confirmBookingByToken, cancelBookingByToken, loadBookingLink, cancelBooking, agendaId, addDaysStr, nowInTimezone, salonSetting } from '../app.js';

const E = process.env;
const SALON = E.SALON_ID || 'demo';
const ADMIN = { email: E.ADMIN_EMAIL || 'admin@bookit.demo', pw: E.ADMIN_PASSWORD || 'Demo2026!' };
const TEAM_PW = E.TEAM_PASSWORD || 'equipa2026';
let pass = 0, fail = 0; const created = [];
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${d}`); } };
const expectErr = async (n, fn, code) => { try { await fn(); ok(n, false, `(expected ${code}, got success)`); } catch (e) { ok(n, e.code === code, `(expected ${code}, got ${e.code || e.message})`); } };
const nextOpen = (days) => { let d = new Date(Date.now() + days * 86400000); while (d.getUTCDay() === 0) d = new Date(d.getTime() + 86400000); return d.toISOString().slice(0, 10); };
const agendaOf = async (staffId, date) => ((await getDoc(doc(db, 'salons', SALON, 'agenda', agendaId(staffId, date)))).data()?.intervals || []);

const salon = await loadSalon(SALON);
const ctx = await loadBookingContext(SALON);
const service = { id: 'PHsXXzGABGEoeXSwkrJh', name: 'Corte + Brushing', duration: 45, price: 35 };
const S = ctx.staff[0];   // full-time staff member (others may have day-offs)
// first Mon–Fri at least 60 days out (some staff have Saturday off)
const D1 = (() => { let d = new Date(Date.now() + 60 * 86400000); while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() + 86400000); return d.toISOString().slice(0, 10); })();
console.log(`\nLinks E2E — ${salon.name} · ${S.name} · ${D1}\n`);
await signOut(auth);

/* create as guest with ?src=ig channel */
const av = await computeAvailability({ salonId: SALON, salon, ctx, service, staff: S, dateStr: D1 });
const start = av.slots.find(m => m >= 15 * 60) ?? av.slots[0];
const g = (n) => ({ id: null, name: `LINK-TEST ${n}`, email: `link-${n}@example.com`, phone: '912 345 678', notes: '' });
const b1 = await createBooking({ salonId: SALON, salon, ctx, service, staff: S, dateStr: D1, startMin: start, client: g('a'), discount: null, channel: 'ig' });
created.push(b1.id);
ok('createBooking returns a manage token', /^[a-f0-9]{32}$/.test(b1.manageToken));
const link = await loadBookingLink({ salonId: SALON, token: b1.manageToken });
ok('bookingLinks/{token} readable without auth, status pending', link && link.status === 'pending' && link.bookingId === b1.id);
ok('link projection carries no PII', link && !('clientName' in link) && !('clientPhone' in link) && !('clientEmail' in link));
ok('link projection has schedule data for cancel', link.staffId === S.id && link.date === D1 && link.startMin === start && link.endMin === start + 45);

/* confirm */
await expectErr('confirm with wrong token is denied', () => confirmBookingByToken({ salonId: SALON, token: 'deadbeefdeadbeefdeadbeefdeadbeef' }), 'booking-not-found');
await expectErr('raw update with wrong viaToken is denied by rules', () => updateDoc(doc(db, 'salons', SALON, 'bookings', b1.id), { status: 'confirmed', confirmedAt: new Date(), confirmedVia: 'link', viaToken: 'nope' }), 'permission-denied');
await confirmBookingByToken({ salonId: SALON, token: b1.manageToken });
ok('confirm by token → link status confirmed', (await loadBookingLink({ salonId: SALON, token: b1.manageToken })).status === 'confirmed');
await expectErr('token holder cannot mark completed', () => updateDoc(doc(db, 'salons', SALON, 'bookings', b1.id), { status: 'completed', viaToken: b1.manageToken }), 'permission-denied');
await expectErr('token holder cannot change price', () => updateDoc(doc(db, 'salons', SALON, 'bookings', b1.id), { finalPrice: 0, viaToken: b1.manageToken }), 'permission-denied');
await expectErr('public cannot add PII to the link projection', () => updateDoc(doc(db, 'salons', SALON, 'bookingLinks', b1.manageToken), { clientName: 'x', status: 'confirmed' }), 'permission-denied');
await expectErr('projection cannot lie about status (must match the booking)', () => updateDoc(doc(db, 'salons', SALON, 'bookingLinks', b1.manageToken), { status: 'cancelled', updatedAt: new Date() }), 'permission-denied');

/* cancel far ahead → agenda released */
ok('agenda holds interval before cancel', (await agendaOf(S.id, D1)).some(iv => iv.bookingId === b1.id));
await cancelBookingByToken({ salonId: SALON, salon, token: b1.manageToken });
ok('cancel by token → link cancelled', (await loadBookingLink({ salonId: SALON, token: b1.manageToken })).status === 'cancelled');
ok('cancel by token → agenda interval released', !(await agendaOf(S.id, D1)).some(iv => iv.bookingId === b1.id));
await expectErr('cancel twice → invalid-transition', () => cancelBookingByToken({ salonId: SALON, salon, token: b1.manageToken }), 'invalid-transition');

/* near booking (created by team for ~6h ahead) → policy blocks token cancel; rules block too */
await signInWithEmailAndPassword(auth, salon.teamEmail, TEAM_PW);
const now = nowInTimezone(salonSetting(salon, 'timezone'));
const soonDate = addDaysStr(now.dateStr, 1);
const soonMin = Math.max(10 * 60, Math.min(17 * 60, now.minutes - 60));
let near = null;
try { near = await createBooking({ salonId: SALON, salon: { ...salon, bookingLeadMinutes: 0 }, ctx, service, staff: S, dateStr: soonDate, startMin: soonMin, client: g('near'), discount: null, source: 'staff', status: 'confirmed' }); created.push(near.id); } catch (e) { console.log('   (near booking skipped:', e.code, ')'); }
await signOut(auth);
if (near) {
  await expectErr('cancel by token < 24h → cancel-too-late (client check)', () => cancelBookingByToken({ salonId: SALON, salon, token: near.manageToken }), 'cancel-too-late');
  await expectErr('… and the rules also refuse a raw cancel', () => updateDoc(doc(db, 'salons', SALON, 'bookings', near.id), { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'client-link', viaToken: near.manageToken }), 'permission-denied');
}

/* staff actions keep the projection in sync */
await signInWithEmailAndPassword(auth, salon.teamEmail, TEAM_PW);
if (near) { await cancelBooking({ salonId: SALON, bookingId: near.id, by: 'team' }); ok('staff cancel syncs link projection', (await loadBookingLink({ salonId: SALON, token: near.manageToken })).status === 'cancelled'); }
await signOut(auth);

/* cleanup */
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
for (const id of created) { try { await cancelBooking({ salonId: SALON, bookingId: id, by: 'admin' }); } catch {} await deleteDoc(doc(db, 'salons', SALON, 'bookings', id)).catch(() => {}); }
for (const t of [b1.manageToken, near?.manageToken].filter(Boolean)) await deleteDoc(doc(db, 'salons', SALON, 'bookingLinks', t)).catch(() => {});
await signOut(auth);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
