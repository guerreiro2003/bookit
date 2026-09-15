/* Upgrade an existing salon to the v2 booking engine.
 *
 *   node scripts/migrate-salon.mjs <salonId> <adminEmail> <adminPassword> [teamPassword]
 *
 * What it does (idempotent, runs as the salon admin so security rules apply):
 *  1. Creates the per-salon TEAM Firebase account (if the salon has none) and
 *     stores teamUid/teamEmail on the salon; removes the legacy SHA-256 hash.
 *  2. Fills in engine settings the salon is missing (timezone, slot interval…).
 *  3. Builds /agenda documents from every pending/confirmed booking and
 *     back-fills startMin/endMin on those bookings. Bookings with no staff are
 *     assigned to the first staff member free at that time.
 *  4. Publishes /referrals/{code} for clients that already have a referral code.
 */
import { signIn, signUp, listAll, getDocument, patchDocument, createDocument, api, FS } from './_lib.mjs';
import { timeToMin, overlaps } from '../booking-core.js';

const [salonId, adminEmail, adminPw, teamPwArg] = process.argv.slice(2);
if (!salonId || !adminEmail || !adminPw) { console.error('usage: node scripts/migrate-salon.mjs <salonId> <adminEmail> <adminPassword> [teamPassword]'); process.exit(1); }

const { token } = await signIn(adminEmail, adminPw);
const salon = await getDocument(token, `salons/${salonId}`);
if (!salon) throw new Error('salon not found: ' + salonId);
console.log(`→ salão "${salon.name}" (${salonId})`);

/* 1. team account */
if (!salon.teamUid) {
  const teamPw = teamPwArg || Math.random().toString(36).slice(2, 10) + 'A1';
  const teamEmail = `equipa-${salonId}-${Date.now().toString(36)}@bookit.team`;
  const team = await signUp(teamEmail, teamPw);
  await patchDocument(token, `salons/${salonId}`, { teamUid: team.uid, teamEmail });
  // remove legacy hash (empty updateMask value = delete)
  await api('PATCH', `${FS}/salons/${salonId}?updateMask.fieldPaths=teamPasswordHash`, token, { fields: {} }).catch(() => {});
  console.log(`   ✓ conta de equipa criada: ${teamEmail}  (password: ${teamPwArg ? '(a fornecida)' : teamPw})`);
} else console.log('   · conta de equipa já existe');

/* 2. engine settings */
const defaults = { timezone: 'Europe/Lisbon', slotInterval: 15, bookingLeadMinutes: 30, maxAdvanceDays: 90, cancellationHours: 24, closedDates: [] };
const missing = Object.fromEntries(Object.entries(defaults).filter(([k]) => salon[k] == null));
if (Object.keys(missing).length) { await patchDocument(token, `salons/${salonId}`, missing); console.log('   ✓ settings preenchidos:', Object.keys(missing).join(', ')); }

/* 3. agenda from bookings */
const [bookings, staff] = await Promise.all([listAll(token, `salons/${salonId}/bookings`), listAll(token, `salons/${salonId}/staff`)]);
const activeStaff = staff.filter(s => s.active !== false).sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
const agenda = new Map(); // key → { staffId, date, intervals[] }
const push = (staffId, date, iv) => { const k = `${staffId}__${date}`; if (!agenda.has(k)) agenda.set(k, { staffId, date, intervals: [] }); agenda.get(k).intervals.push(iv); };
let fixed = 0, assigned = 0, skipped = 0;
for (const b of bookings.filter(b => ['pending', 'confirmed'].includes(b.status))) {
  const start = timeToMin(b.time); const dur = b.serviceDuration || 30;
  if (start == null) { skipped++; continue; }
  const iv = { start, end: start + dur, bookingId: b.id };
  let staffId = b.staffId;
  if (!staffId) {
    const free = activeStaff.find(s => !(agenda.get(`${s.id}__${b.date}`)?.intervals || []).some(x => overlaps(x, iv)));
    if (!free) { skipped++; console.log(`   ! sem staff livre para ${b.id} ${b.date} ${b.time}`); continue; }
    staffId = free.id; assigned++;
    await patchDocument(token, `salons/${salonId}/bookings/${b.id}`, { staffId, staffName: free.name, staffPreference: 'any', startMin: start, endMin: start + dur });
  } else if (b.startMin == null) {
    await patchDocument(token, `salons/${salonId}/bookings/${b.id}`, { startMin: start, endMin: start + dur });
    fixed++;
  }
  push(staffId, b.date, iv);
}
for (const [id, a] of agenda) {
  await api('PATCH', `${FS}/salons/${salonId}/agenda/${id}`, token, { fields: { staffId: { stringValue: a.staffId }, date: { stringValue: a.date }, intervals: { arrayValue: { values: a.intervals.map(iv => ({ mapValue: { fields: { start: { integerValue: String(iv.start) }, end: { integerValue: String(iv.end) }, bookingId: { stringValue: iv.bookingId } } } })) } } } });
}
console.log(`   ✓ agenda: ${agenda.size} docs · bookings back-filled ${fixed} · staff atribuído ${assigned} · ignorados ${skipped}`);

/* 4. referrals */
const clients = await listAll(token, `salons/${salonId}/clients`);
let refs = 0;
for (const c of clients) {
  if (!c.referralCode || c.deleted) continue;
  const exists = await getDocument(token, `salons/${salonId}/referrals/${c.referralCode}`);
  if (exists) continue;
  await createDocument(token, `salons/${salonId}/referrals`, c.referralCode, { clientId: c.id, createdAt: new Date() });
  refs++;
}
console.log(`   ✓ referrals publicados: ${refs}`);
console.log('done.');
