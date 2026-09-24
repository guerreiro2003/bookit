/* Integration tests for firestore.rules — exercised over REST.
 *
 *   node --import ./tests/_register.mjs tests/rules.integration.mjs
 *
 * Goes to the EMULATOR by default (tests/_register.mjs), where the two salons
 * it needs are seeded by scripts/seed-emulator.mjs. `BOOKIT_TARGET=real` sends
 * it at production instead, and then the salon ids, accounts and SERVICE_ID
 * have to come from the environment — see tests/_target.mjs.
 *
 * An older header here said "point FIREBASE_PROJECT at an emulator project for
 * CI". That was never true: FIREBASE_PROJECT only changes the project id in
 * the URL, and the host stayed firestore.googleapis.com — following it wrote
 * to production. BOOKIT_TARGET is what switches the endpoints.
 *
 * Creates clearly-named test documents (clientName "RULES-TEST …") and deletes
 * them at the end.
 */
import { signIn, signUp, getDocument, listAll, patchDocument, createDocument, deleteDocument, api, FS, API_KEY, IDENTITY, toValue } from '../scripts/_lib.mjs';
import { timeToMin } from '../booking-core.js';
import { SALON, OTHER_SALON as OTHER, ADMIN, CLIENT, TEAM_PW, SERVICE_ID } from './_target.mjs';

let pass = 0, fail = 0;
const created = []; // [path] for cleanup
function check(name, ok, detail = '') { if (ok) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${detail}`); } }
async function expectStatus(name, fn, status) {
  try { await fn(); check(name, status === 200, `(expected ${status}, got 200)`); }
  catch (e) { check(name, e.status === status, `(expected ${status}, got ${e.status} ${e.body?.error?.message || e.message})`); }
}
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]));
const runQuery = (token, parent, colId, where) => api('POST', `${FS}/${parent}:runQuery`, token, { structuredQuery: { from: [{ collectionId: colId }], where } });

const future = (days) => { const d = new Date(Date.now() + days * 86400000); return d.toISOString().slice(0, 10); };
// pick a weekday that is open (Mon–Sat): move to next Monday-ish
function nextOpenDate(daysAhead) { let d = new Date(Date.now() + daysAhead * 86400000); while (d.getUTCDay() === 0) d = new Date(d.getTime() + 86400000); return d.toISOString().slice(0, 10); }

const salon = await getDocument(null, `salons/${SALON}`);
const service = await getDocument(null, `salons/${SALON}/services/${SERVICE_ID}`);
const staff = (await listAll(null, `salons/${SALON}/staff`)).filter(s => s.active !== false);
const S1 = staff[0];
// A different pair of days on each run. With fixed dates, a run interrupted
// before its cleanup left an agenda document behind and the NEXT run failed
// with "document already exists" — a red suite that says nothing about the
// rules is worse than no suite.
const OFFSET = 20 + (Date.now() % 15);
const D1 = nextOpenDate(OFFSET), D2 = nextOpenDate(OFFSET + 7);
const booking = (over) => ({
  salonId: SALON, clientId: null, clientName: 'RULES-TEST visitante', clientEmail: 'rules-test@example.com', clientPhone: '912345678', clientPhoneE164: '351912345678',
  forSomeone: null, notes: '', serviceIds: [SERVICE_ID], serviceId: SERVICE_ID, serviceName: service.name, serviceDuration: service.duration, servicePrice: service.price,
  finalPrice: service.price, discountType: null, discountCode: null, referralCode: null, referralDiscount: 0,
  staffId: S1.id, staffName: S1.name, staffPreference: 'chosen', date: D1, time: '10:00', startMin: 600, endMin: 600 + service.duration,
  status: 'pending', paid: false, source: 'online', createdAt: new Date(), ...over,
});
const agendaDoc = (staffId, date, byBooking) => ({ staffId, date, byBooking, updatedAt: new Date() });
const blocks = (s, e) => ({ blocks: [{ start: s, end: e }] });
const service2 = (await listAll(null, `salons/${SALON}/services`)).find(s => s.id !== SERVICE_ID && s.active !== false);

console.log(`\nRules integration — salon=${SALON} service=${service.name} staff=${S1.name} dates=${D1},${D2}\n`);

/* ── 1. PUBLIC (unauthenticated) ── */
console.log('PUBLIC');
await expectStatus('agenda NOT listable without auth', () => api('GET', `${FS}/salons/${SALON}/agenda?pageSize=1`, null), 403);
await expectStatus('bookings NOT listable without auth (PII closed)', () => api('GET', `${FS}/salons/${SALON}/bookings?pageSize=1`, null), 403);
await expectStatus('clients NOT readable without auth', () => runQuery(null, `salons/${SALON}`, 'clients', { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: 'x@x.pt' } } }), 403);
await expectStatus('referrals NOT listable without auth (codes not enumerable)', () => api('GET', `${FS}/salons/${SALON}/referrals?pageSize=1`, null), 403);
await expectStatus('bookingLinks NOT listable without auth (tokens not enumerable)', () => api('GET', `${FS}/salons/${SALON}/bookingLinks?pageSize=1`, null), 403);

/* ── agenda ──────────────────────────────────────────────────────────────
   An agenda entry is a SHADOW of a booking, never a thing of its own. Before
   this was enforced, anyone without a login could write blocks for a booking
   that did not exist and close a salon's whole calendar — invisibly, because
   the owner's booking list stayed empty. These tests are that regression.   */
const agId = `${S1.id}__${D1}`;
const dur = service.duration;
const agenda = (byBooking, viaBookingId) => ({ staffId: S1.id, date: D1, byBooking, viaBookingId, updatedAt: new Date() });
const mkBooking = async (over) => {
  const id = (await createDocument(null, `salons/${SALON}/bookings`, null, booking(over))).name.split('/').pop();
  created.push(`salons/${SALON}/bookings/${id}`);
  return id;
};
// real bookings for the entries to shadow (the REST path creates them without
// their agenda hold, which is exactly what we need to test the agenda rule)
const ag1 = await mkBooking({});
const ag2 = await mkBooking({ time: '11:00', startMin: 660, endMin: 660 + dur });
const agOtherDay = await mkBooking({ date: D2, time: '10:00' });

await expectStatus('public creates an agenda entry for its own booking', async () => { await createDocument(null, `salons/${SALON}/agenda`, agId, agenda({ [ag1]: blocks(600, 600 + dur) }, ag1)); created.push(`salons/${SALON}/agenda/${agId}`); }, 200);
await expectStatus('agenda doc GET-able without auth (availability)', () => api('GET', `${FS}/salons/${SALON}/agenda/${agId}`, null), 200);
await expectStatus('public agenda id must match staffId__date', () => createDocument(null, `salons/${SALON}/agenda`, `${S1.id}__${D2}`, agenda({ [ag1]: blocks(600, 600 + dur) }, ag1)), 403);
await expectStatus('public adds a second entry for another real booking', () => patchDocument(null, `salons/${SALON}/agenda/${agId}`, agenda({ [ag1]: blocks(600, 600 + dur), [ag2]: blocks(660, 660 + dur) }, ag2), { merge: false }), 200);
// the fix itself
await expectStatus('agenda entry for a booking that does NOT exist', () => patchDocument(null, `salons/${SALON}/agenda/${agId}`, agenda({ [ag1]: blocks(600, 600 + dur), [ag2]: blocks(660, 660 + dur), 'NOT-A-BOOKING': blocks(0, 1440) }, 'NOT-A-BOOKING'), { merge: false }), 403);
await expectStatus('blocks wider than the booking they claim', () => patchDocument(null, `salons/${SALON}/agenda/${agId}`, agenda({ [ag1]: blocks(600, 600 + dur), [ag2]: blocks(660, 660 + dur), [agOtherDay]: blocks(0, 1440) }, agOtherDay), { merge: false }), 403);
await expectStatus('entry claiming a booking from another day', () => patchDocument(null, `salons/${SALON}/agenda/${agId}`, agenda({ [ag1]: blocks(600, 600 + dur), [ag2]: blocks(660, 660 + dur), [agOtherDay]: blocks(600, 600 + dur) }, agOtherDay), { merge: false }), 403);
await expectStatus('viaBookingId naming one booking while adding another', () => patchDocument(null, `salons/${SALON}/agenda/${agId}`, agenda({ [ag1]: blocks(600, 600 + dur), [ag2]: blocks(660, 660 + dur), 'SNEAKY': blocks(720, 780) }, ag1), { merge: false }), 403);
await expectStatus('public may NOT add two entries at once', () => patchDocument(null, `salons/${SALON}/agenda/${agId}`, agenda({ [ag1]: blocks(600, 600 + dur), [ag2]: blocks(660, 660 + dur), a: blocks(720, 765), b: blocks(780, 825) }, ag1), { merge: false }), 403);
await expectStatus('public may NOT remove someone else\'s entry', () => patchDocument(null, `salons/${SALON}/agenda/${agId}`, agenda({ [ag1]: blocks(600, 600 + dur) }, ag2), { merge: false }), 403);
await expectStatus('public may NOT rewrite another booking while adding its own', () => patchDocument(null, `salons/${SALON}/agenda/${agId}`, agenda({ [ag1]: blocks(0, 1), [ag2]: blocks(660, 660 + dur), rt3: blocks(800, 830) }, ag2), { merge: false }), 403);
await expectStatus('public may NOT wipe the day', () => patchDocument(null, `salons/${SALON}/agenda/${agId}`, agenda({}, ag1), { merge: false }), 403);
// a booking with several services: price and duration must equal the catalogue sum
const multi = (over) => booking({ serviceIds: [SERVICE_ID, service2.id], serviceName: `${service.name} + ${service2.name}`,
  servicePrice: service.price + service2.price, serviceDuration: service.duration + service2.duration,
  finalPrice: service.price + service2.price, endMin: 600 + service.duration + service2.duration, date: D2, time: '12:00', startMin: 720, ...over });
await expectStatus('two services: correct sum accepted', async () => { const r = await createDocument(null, `salons/${SALON}/bookings`, null, multi({ endMin: 720 + service.duration + service2.duration })); created.push(`salons/${SALON}/bookings/${r.name.split('/').pop()}`); }, 200);
await expectStatus('two services: inflated price rejected', () => createDocument(null, `salons/${SALON}/bookings`, null, multi({ servicePrice: 999, finalPrice: 999, endMin: 720 + service.duration + service2.duration })), 403);
await expectStatus('two services: wrong duration rejected', () => createDocument(null, `salons/${SALON}/bookings`, null, multi({ serviceDuration: 15, endMin: 735 })), 403);
await expectStatus('more than 3 services rejected', () => createDocument(null, `salons/${SALON}/bookings`, null, multi({ serviceIds: [SERVICE_ID, service2.id, SERVICE_ID, service2.id], endMin: 720 + service.duration + service2.duration })), 403);

let b1;
await expectStatus('public creates a valid online booking', async () => { b1 = (await createDocument(null, `salons/${SALON}/bookings`, null, booking({}))).name.split('/').pop(); created.push(`salons/${SALON}/bookings/${b1}`); }, 200);
await expectStatus('reject finalPrice below 50% of service', () => createDocument(null, `salons/${SALON}/bookings`, null, booking({ finalPrice: 1 })), 403);
await expectStatus('reject finalPrice above service price', () => createDocument(null, `salons/${SALON}/bookings`, null, booking({ finalPrice: service.price + 1 })), 403);
await expectStatus('reject lying about servicePrice', () => createDocument(null, `salons/${SALON}/bookings`, null, booking({ servicePrice: 1, finalPrice: 1 })), 403);
await expectStatus('reject status=confirmed from public', () => createDocument(null, `salons/${SALON}/bookings`, null, booking({ status: 'confirmed' })), 403);
await expectStatus('reject paid=true from public', () => createDocument(null, `salons/${SALON}/bookings`, null, booking({ paid: true })), 403);
await expectStatus('reject bad email', () => createDocument(null, `salons/${SALON}/bookings`, null, booking({ clientEmail: 'nope' })), 403);
await expectStatus('accept empty email (phone is the identity)', async () => { const r = await createDocument(null, `salons/${SALON}/bookings`, null, booking({ clientEmail: '', date: D2, time: '16:00', startMin: 960, endMin: 960 + service.duration })); created.push(`salons/${SALON}/bookings/${r.name.split('/').pop()}`); }, 200);
await expectStatus('reject online booking without normalised phone', () => createDocument(null, `salons/${SALON}/bookings`, null, booking({ clientPhoneE164: '' })), 403);
await expectStatus('reject bad date', () => createDocument(null, `salons/${SALON}/bookings`, null, booking({ date: '2027-02-30' })), 403);
await expectStatus('reject bad time', () => createDocument(null, `salons/${SALON}/bookings`, null, booking({ time: '25:00' })), 403);
await expectStatus('reject endMin inconsistent with duration', () => createDocument(null, `salons/${SALON}/bookings`, null, booking({ endMin: 700 })), 403);
await expectStatus('reject unknown serviceId', () => createDocument(null, `salons/${SALON}/bookings`, null, booking({ serviceId: 'nope' })), 403);
await expectStatus('reject oversized notes (>500)', () => createDocument(null, `salons/${SALON}/bookings`, null, booking({ notes: 'x'.repeat(501) })), 403);
await expectStatus('public cannot create a client doc', () => createDocument(null, `salons/${SALON}/clients`, null, { name: 'RULES-TEST', email: 'a@b.pt', visits: 0, points: 0, totalSpent: 0, discounts: [] }), 403);
await expectStatus('public cannot update a booking', () => patchDocument(null, `salons/${SALON}/bookings/${b1}`, { status: 'confirmed' }), 403);

/* ── 2. ANONYMOUS AUTH has no staff powers anymore ── */
console.log('ANONYMOUS AUTH');
const anon = await (await fetch(`${IDENTITY}/accounts:signUp?key=${API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' })).json();
if (anon.idToken) {
  await expectStatus('anonymous cannot list bookings', () => api('GET', `${FS}/salons/${SALON}/bookings?pageSize=1`, anon.idToken), 403);
  await expectStatus('anonymous cannot confirm a booking', () => patchDocument(anon.idToken, `salons/${SALON}/bookings/${b1}`, { status: 'confirmed' }), 403);
} else console.log('  · anonymous provider disabled — skipped');

/* ── 3. TEAM ── */
console.log('TEAM');
const team = await signIn(salon.teamEmail, TEAM_PW);
check('team signs in with salon.teamEmail', !!team.token);
await expectStatus('team lists bookings', () => api('GET', `${FS}/salons/${SALON}/bookings?pageSize=1`, team.token), 200);
await expectStatus('team confirms pending booking', () => patchDocument(team.token, `salons/${SALON}/bookings/${b1}`, { status: 'confirmed', confirmedAt: new Date() }), 200);
await expectStatus('team cannot change finalPrice', () => patchDocument(team.token, `salons/${SALON}/bookings/${b1}`, { finalPrice: 0 }), 403);
await expectStatus('team cannot change clientEmail', () => patchDocument(team.token, `salons/${SALON}/bookings/${b1}`, { clientEmail: 'evil@x.pt' }), 403);
await expectStatus('team cannot skip state machine (confirmed→pending)', () => patchDocument(team.token, `salons/${SALON}/bookings/${b1}`, { status: 'pending' }), 403);
await expectStatus('team completes booking', () => patchDocument(team.token, `salons/${SALON}/bookings/${b1}`, { status: 'completed', paid: true, paidAt: new Date(), paymentMethod: 'balcao', pointsAwarded: 10 }), 200);
await expectStatus('completed→cancelled is forbidden', () => patchDocument(team.token, `salons/${SALON}/bookings/${b1}`, { status: 'cancelled' }), 403);
await expectStatus('team cannot edit salon settings', () => patchDocument(team.token, `salons/${SALON}`, { name: 'hack' }), 403);
await expectStatus('team cannot edit services', () => patchDocument(team.token, `salons/${SALON}/services/${SERVICE_ID}`, { price: 1 }), 403);
await expectStatus('team creates a confirmed walk-in booking', async () => { const r = await createDocument(team.token, `salons/${SALON}/bookings`, null, booking({ status: 'confirmed', source: 'staff', clientEmail: '', date: D2 })); created.push(`salons/${SALON}/bookings/${r.name.split('/').pop()}`); }, 200);

/* ── 4. ADMIN ── */
console.log('ADMIN');
const admin = await signIn(ADMIN.email, ADMIN.pw);
await expectStatus('admin creates confirmed booking (regression: was blocked)', async () => { const r = await createDocument(admin.token, `salons/${SALON}/bookings`, null, booking({ status: 'confirmed', source: 'admin', clientEmail: '', time: '15:00', startMin: 900, endMin: 900 + service.duration })); created.push(`salons/${SALON}/bookings/${r.name.split('/').pop()}`); }, 200);
await expectStatus('admin cannot change plan (billing field)', () => patchDocument(admin.token, `salons/${SALON}`, { plan: 'suspended' }), 403);
await expectStatus('admin cannot extend own trial', () => patchDocument(admin.token, `salons/${SALON}`, { trialEndsAt: new Date(Date.now() + 365 * 86400000) }), 403);
await expectStatus('admin cannot change adminUid', () => patchDocument(admin.token, `salons/${SALON}`, { adminUid: 'x' }), 403);
await expectStatus('admin rejects invalid slotInterval', () => patchDocument(admin.token, `salons/${SALON}`, { slotInterval: 7 }), 403);
await expectStatus('admin accepts valid settings', () => patchDocument(admin.token, `salons/${SALON}`, { slotInterval: 15, cancellationHours: 24 }), 200);
await expectStatus('admin rejects service with negative price', () => createDocument(admin.token, `salons/${SALON}/services`, null, { name: 'RULES-TEST', price: -1, duration: 30, active: true }), 403);
await expectStatus('admin rejects service duration 1000', () => createDocument(admin.token, `salons/${SALON}/services`, null, { name: 'RULES-TEST', price: 10, duration: 1000, active: true }), 403);

/* ── 5. CLIENT ── */
console.log('CLIENT');
const client = await signIn(CLIENT.email, CLIENT.pw);
// team creates two bookings for this client: one far ahead (cancellable) and one within 24h (not)
const soon = new Date(Date.now() + 6 * 3600000); const soonDate = soon.toISOString().slice(0, 10); const soonTime = `${String(soon.getUTCHours()).padStart(2, '0')}:00`;
const mk = (over) => createDocument(team.token, `salons/${SALON}/bookings`, null, booking({ clientId: client.uid, clientEmail: CLIENT.email, clientName: 'RULES-TEST cliente', status: 'confirmed', source: 'staff', ...over }));
const far = (await mk({ date: D2, time: '11:00', startMin: 660, endMin: 660 + service.duration })).name.split('/').pop(); created.push(`salons/${SALON}/bookings/${far}`);
const near = (await mk({ date: soonDate, time: soonTime, startMin: timeToMin(soonTime), endMin: timeToMin(soonTime) + service.duration })).name.split('/').pop(); created.push(`salons/${SALON}/bookings/${near}`);
await expectStatus('client reads own bookings by clientId', () => runQuery(client.token, `salons/${SALON}`, 'bookings', { fieldFilter: { field: { fieldPath: 'clientId' }, op: 'EQUAL', value: { stringValue: client.uid } } }), 200);
await expectStatus('client cannot list all bookings', () => api('GET', `${FS}/salons/${SALON}/bookings?pageSize=1`, client.token), 403);
await expectStatus('client cancels own booking > 24h ahead', () => patchDocument(client.token, `salons/${SALON}/bookings/${far}`, { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'client', previousStatus: 'confirmed' }), 200);
await expectStatus('client cannot cancel < 24h ahead (policy)', () => patchDocument(client.token, `salons/${SALON}/bookings/${near}`, { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'client', previousStatus: 'confirmed' }), 403);
await expectStatus('client cannot mark own booking completed', () => patchDocument(client.token, `salons/${SALON}/bookings/${near}`, { status: 'completed' }), 403);
await expectStatus('client cannot cancel someone else\'s booking', () => patchDocument(client.token, `salons/${SALON}/bookings/${b1}`, { status: 'cancelled' }), 403);
await expectStatus('client erases own PII (GDPR)', () => patchDocument(client.token, `salons/${SALON}/bookings/${near}`, { clientName: 'Anonimizado', clientEmail: '', clientPhone: '', notes: '', anonymised: true, anonymisedAt: new Date() }), 200);
await expectStatus('client cannot inflate own points', () => patchDocument(client.token, `salons/${SALON}/clients/${client.uid}`, { points: 99999 }), 403);
await expectStatus('client edits own phone', () => patchDocument(client.token, `salons/${SALON}/clients/${client.uid}`, { phone: '912000000' }), 200);
await expectStatus('client cannot change own email', () => patchDocument(client.token, `salons/${SALON}/clients/${client.uid}`, { email: 'other@x.pt' }), 403);
await expectStatus('client publishes own referral code', async () => { await createDocument(client.token, `salons/${SALON}/referrals`, 'RULESTEST1', { clientId: client.uid }); created.push(`salons/${SALON}/referrals/RULESTEST1`); }, 200);
await expectStatus('a typed referral code is GET-able without auth', () => api('GET', `${FS}/salons/${SALON}/referrals/RULESTEST1`, null), 200);
await expectStatus('client cannot publish a referral for another uid', () => createDocument(client.token, `salons/${SALON}/referrals`, 'RULESTEST2', { clientId: 'someone-else' }), 403);

/* ── 6. TENANT ISOLATION ── */
console.log('TENANT ISOLATION');
await expectStatus('demo admin cannot read other salon bookings', () => api('GET', `${FS}/salons/${OTHER}/bookings?pageSize=1`, admin.token), 403);
await expectStatus('demo admin cannot edit other salon', () => patchDocument(admin.token, `salons/${OTHER}`, { name: 'hack' }), 403);
await expectStatus('demo team cannot confirm other salon bookings', () => patchDocument(team.token, `salons/${OTHER}/bookings/nonexistent`, { status: 'confirmed' }), 403);
await expectStatus('demo admin cannot write other salon services', () => createDocument(admin.token, `salons/${OTHER}/services`, null, { name: 'x', price: 1, duration: 30, active: true }), 403);
await expectStatus('demo client cannot read other salon clients', () => api('GET', `${FS}/salons/${OTHER}/clients?pageSize=1`, client.token), 403);

/* ── cleanup ── */
for (const p of created.reverse()) { try { await deleteDocument(admin.token, p); } catch (e) { console.log('  cleanup failed', p, e.status); } }
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
