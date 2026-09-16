/* E2E of the reactivation loop against the real project:
 * seed a client with history → engine flags them "em risco" with the right
 * explanation → staff logs a message (rules) → client books through the
 * attribution link → revenue is ATTRIBUTED → cooldown suppresses a second nudge.
 *
 *   node --import ./tests/_register.mjs tests/retention.e2e.mjs
 */
import { db, auth, doc, getDoc, getDocs, collection, deleteDoc, setDoc, signInWithEmailAndPassword, signOut } from '../firebase.js';
import {
  loadSalon, loadBookingContext, computeAvailability, createBooking, markBookingPaid, cancelBooking,
  loadRetention, logReactivation, deleteReactivation, reactivationLink, agendaId, addDaysStr, todayForSalon, randomToken,
} from '../app.js';
import { buildClientProfiles, reactivationCandidates, retentionSummary, explain, reactivationMessage, RISK } from '../retention-core.js';
import { computeRecovered } from '../metrics-core.js';

const E = process.env;
const SALON = E.SALON_ID || 'demo';
const ADMIN = { email: E.ADMIN_EMAIL || 'admin@bookit.demo', pw: E.ADMIN_PASSWORD || 'Demo2026!' };
const TEAM_PW = E.TEAM_PASSWORD || 'equipa2026';
const PHONE = '351919000777';                       // dedicated test identity

let pass = 0, fail = 0;
const madeBookings = [], madeTokens = [];
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${d}`); } };
const expectErr = async (n, fn, code) => { try { await fn(); ok(n, false, `(expected ${code}, got success)`); } catch (e) { ok(n, e.code === code, `(expected ${code}, got ${e.code || e.message})`); } };

const salon = await loadSalon(SALON);
const ctx = await loadBookingContext(SALON);
const today = todayForSalon(salon);
const S = ctx.staff[0];
const service = { id: 'PHsXXzGABGEoeXSwkrJh', name: 'Corte + Brushing', duration: 45, price: 35 };
console.log(`\nRetention E2E — ${salon.name} · hoje ${today}\n`);

/* ── seed history: visits 140 / 105 / 70 days ago (cadence 35 → 2× overdue) ── */
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
// Seed the way real life does it: staff create the booking as confirmed, then
// register payment. The rules refuse a booking fabricated as completed+paid.
const seed = [];
for (const back of [140, 105, 70]) {
  const date = addDaysStr(today, -back);
  const id = `RETTEST-${back}-${Date.now().toString(36)}`;
  await setDoc(doc(db, 'salons', SALON, 'bookings', id), {
    salonId: SALON, clientId: null, clientName: 'RET-TEST Ana', clientEmail: '', clientPhone: '919 000 777', clientPhoneE164: PHONE,
    serviceId: service.id, serviceName: service.name, serviceDuration: 45, servicePrice: 35, finalPrice: 35,
    staffId: S.id, staffName: S.name, date, time: '10:00', startMin: 600, endMin: 645,
    status: 'confirmed', paid: false, source: 'admin', manageToken: null, createdAt: new Date(),
  });
  madeBookings.push(id);
  await markBookingPaid({ salonId: SALON, salon, bookingId: id, method: 'balcao' });
  seed.push(id);
}
ok('seeded 3 past visits (confirmed → paid, as the rules require)', seed.length === 3);

/* ── engine: is she flagged, with the right explanation? ── */
let { bookings, reactivations } = await loadRetention({ salonId: SALON, salon });
let { profiles } = buildClientProfiles({ bookings, today, reactivations });
let p = profiles.find(x => x.key === PHONE);
ok('client profile built from bookings (no client doc needed)', !!p && p.visits === 3);
ok('cadence learned from her own rhythm (35 days)', p.cadenceDays === 35 && p.cadenceSource === 'own');
ok('status = em risco (70 days = 2× cadence)', p.status === RISK.AT_RISK, `(got ${p?.status})`);
ok('explanation is human and specific', /Vinha a cada 5 semanas; já passaram 10 semanas/.test(explain(p)), explain(p));
ok('value counted from what she actually paid', p.spent12m === 105 && p.avgTicket === 35);
ok('appears in the actionable list', reactivationCandidates(profiles).some(x => x.key === PHONE));
const msg = reactivationMessage({ profile: p, salonName: salon.name, link: 'https://x/?rt=t' });
ok('message is personal and carries the link', /^Olá \S+!/.test(msg) && msg.includes(salon.name) && msg.includes(service.name) && msg.includes('https://x/?rt=t'), msg.slice(0, 60));

/* ── rules: who may write the reactivation log ── */
await signOut(auth);
await expectErr('public cannot read the reactivation log (PII)', () => getDocs(collection(db, 'salons', SALON, 'reactivations')), 'permission-denied');
await expectErr('public cannot write a reactivation', () => logReactivation({ salonId: SALON, profile: p, token: randomToken(8) }), 'permission-denied');
await signInWithEmailAndPassword(auth, salon.teamEmail, TEAM_PW);
const token = randomToken(8);
await logReactivation({ salonId: SALON, profile: p, kind: 'sent', token, by: 'team' });
madeTokens.push(token);
ok('team can log a sent message', (await getDoc(doc(db, 'salons', SALON, 'reactivations', token))).exists());
await signOut(auth);

/* ── cooldown: she should not be suggested again right away ── */
({ bookings, reactivations } = await (async () => { await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw); const r = await loadRetention({ salonId: SALON, salon }); return r; })());
({ profiles } = buildClientProfiles({ bookings, today, reactivations }));
p = profiles.find(x => x.key === PHONE);
ok('after contacting, she is suppressed for 30 days', p.suppressed === true && p.daysSinceContact === 0);
ok('and drops out of the actionable list', !reactivationCandidates(profiles).some(x => x.key === PHONE));
ok('but is still visible with includeSuppressed', reactivationCandidates(profiles, { includeSuppressed: true }).some(x => x.key === PHONE));
await signOut(auth);

/* ── she books through the link (as an anonymous visitor) ── */
const link = reactivationLink({ salonId: SALON, token });
ok('link carries salon, source and token', link.includes(`salon=${SALON}`) && link.includes('src=reativacao') && link.includes(`rt=${token}`));
const future = (() => { let d = new Date(Date.now() + 25 * 86400000); while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() + 86400000); return d.toISOString().slice(0, 10); })();
const av = await computeAvailability({ salonId: SALON, salon, ctx, service, staff: S, dateStr: future });
const start = av.slots.find(m => m >= 11 * 60) ?? av.slots[0];
const booked = await createBooking({
  salonId: SALON, salon, ctx, service, staff: S, dateStr: future, startMin: start,
  client: { id: null, name: 'RET-TEST Ana', email: '', phone: '919 000 777' },
  discount: null, source: 'online', channel: 'reativacao', reactivationToken: token,
});
madeBookings.push(booked.id);
const bookedDoc = (await (async () => { await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw); return getDoc(doc(db, 'salons', SALON, 'bookings', booked.id)); })()).data();
ok('booking stores the attribution token', bookedDoc.reactivationToken === token && bookedDoc.channel === 'reativacao');

/* ── attribution: upcoming, then realised after payment ── */
let r = await loadRetention({ salonId: SALON, salon });
let rec = computeRecovered({ bookings: r.bookings, reactivations: r.reactivations, from: addDaysStr(today, -365), to: addDaysStr(today, 365) });
ok('recovered: counted as booked & upcoming, not yet as revenue', rec.booked >= 1 && rec.revenueUpcoming >= 35 && rec.revenueRealised === 0, JSON.stringify({ booked: rec.booked, up: rec.revenueUpcoming, real: rec.revenueRealised }));
({ profiles } = buildClientProfiles({ bookings: r.bookings, today, reactivations: r.reactivations }));
p = profiles.find(x => x.key === PHONE);
ok('she is now "agendado" — never chased again while booked', p.status === RISK.SCHEDULED && p.upcomingDate === future);

await markBookingPaid({ salonId: SALON, salon, bookingId: booked.id, method: 'balcao' });
r = await loadRetention({ salonId: SALON, salon });
rec = computeRecovered({ bookings: r.bookings, reactivations: r.reactivations, from: addDaysStr(today, -365), to: addDaysStr(today, 365) });
ok('after payment it becomes realised revenue (attributed)', rec.revenueRealised >= 35 && rec.realisedCount >= 1);
ok('response rate computed from sent vs booked', rec.bookingRate != null && rec.bookingRate > 0);

/* ── a cancelled booking that is NOT reactivated must not be attributed ── */
const other = await (async () => { await signOut(auth); return createBooking({ salonId: SALON, salon, ctx, service, staff: S, dateStr: future, startMin: start + 60, client: { id: null, name: 'RET-TEST Outro', email: '', phone: '919 000 778' }, discount: null, source: 'online' }); })();
madeBookings.push(other.id);
r = await (async () => { await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw); return loadRetention({ salonId: SALON, salon }); })();
const rec2 = computeRecovered({ bookings: r.bookings, reactivations: r.reactivations, from: addDaysStr(today, -365), to: addDaysStr(today, 365) });
ok('bookings without a token are never attributed', rec2.booked === rec.booked);

/* ── cleanup ── */
for (const id of madeBookings) {
  const s = await getDoc(doc(db, 'salons', SALON, 'bookings', id));
  if (s.exists()) {
    const b = s.data();
    if (['pending', 'confirmed'].includes(b.status)) { try { await cancelBooking({ salonId: SALON, bookingId: id, by: 'admin' }); } catch {} }
    const aRef = doc(db, 'salons', SALON, 'agenda', agendaId(b.staffId, b.date));
    const a = await getDoc(aRef);
    if (a.exists() && (a.data().intervals || []).some(iv => iv.bookingId === id)) {
      await setDoc(aRef, { ...a.data(), intervals: a.data().intervals.filter(iv => iv.bookingId !== id) });
    }
    if (b.manageToken) await deleteDoc(doc(db, 'salons', SALON, 'bookingLinks', b.manageToken)).catch(() => {});
    await deleteDoc(s.ref);
  }
}
for (const t of madeTokens) await deleteReactivation({ salonId: SALON, token: t }).catch(() => {});
const leftoverClients = await getDocs(collection(db, 'salons', SALON, 'clients'));
for (const d of leftoverClients.docs) if ((d.data().name || '').startsWith('RET-TEST')) await deleteDoc(d.ref);
await signOut(auth);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
