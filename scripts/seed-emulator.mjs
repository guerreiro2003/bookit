/* Fill a freshly booted emulator with two salons that look like a real tenant.
 *
 *   firebase emulators:exec --project demo-bookit --only firestore,auth \
 *     "BOOKIT_TARGET=emulator node scripts/seed-emulator.mjs"
 *
 * Why two salons, and why both with real data: the cross-tenant tests (KI-016)
 * ask whether one salon's admin can read another salon's bookings. Today they
 * point at `zenorganic`, which does not exist — the read is refused because
 * there is nothing there, not because the rules kept anybody out, and the
 * suite passes without ever testing isolation. A second salon WITH clients and
 * bookings is what turns that assertion back into a question worth asking.
 *
 * Everything here is invented. Names are made up, every address is @….demo —
 * a TLD that does not exist, so no message can ever reach a real person.
 *
 * Idempotent: every document has a fixed id and is written with a full PATCH,
 * and accounts are created-or-signed-into. Run it twice and the state is the
 * same, with no duplicates.
 */
import {
  FS, PROJECT, TARGET, IS_EMULATOR, API_KEY, targetSummary,
  ownerToken, api, listAll, toValue,
} from './_lib.mjs';

/* ── The guard ────────────────────────────────────────────────────────────
   Before any network call, and structural rather than trusting a flag: the
   endpoint must be on this machine AND the project must be a `demo-` one.
   Checking BOOKIT_TARGET alone would not be enough — FIREBASE_PROJECT can
   point a "real" run somewhere unexpected, and a flag is a statement of
   intent while a URL is what actually happens. */
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1', '0.0.0.0'];
function assertEmulator() {
  const problems = [];
  let host = '(URL ilegível)';
  try { host = new URL(FS).hostname.replace(/^\[|\]$/g, ''); } catch { /* keep the placeholder */ }

  if (!LOCAL_HOSTS.includes(host)) problems.push(`o endpoint não é local: ${host}`);
  if (!PROJECT.startsWith('demo-')) problems.push(`o projeto não começa por "demo-": ${PROJECT}`);
  if (!IS_EMULATOR) problems.push(`BOOKIT_TARGET resolveu para "${TARGET}"`);

  if (problems.length) {
    console.error('\n✗ o seed só corre contra o emulador, e este alvo não é um emulador:');
    for (const p of problems) console.error(`   · ${p}`);
    console.error(`\n  alvo atual: ${targetSummary()}`);
    console.error('\n  Corre assim:');
    console.error('    firebase emulators:exec --project demo-bookit --only firestore,auth \\');
    console.error('      "BOOKIT_TARGET=emulator node scripts/seed-emulator.mjs"\n');
    process.exit(1);
  }
}
assertEmulator();

const token = await ownerToken();
const write = (path, fields) => api('PATCH', `${FS}/${path}`, token,
  { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) });

/* ── Auth ─────────────────────────────────────────────────────────────────
   Create the account, or sign into it if a previous run already made it —
   which is what keeps the uids stable when this script runs twice. */
const IDENTITY = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}/identitytoolkit.googleapis.com/v1`;

async function account(email, password, { verified = false } = {}) {
  const post = (path, body, auth) => api('POST', `${IDENTITY}/${path}?key=${API_KEY}`, auth, body);
  let uid;
  try {
    uid = (await post('accounts:signUp', { email, password, returnSecureToken: true })).localId;
  } catch (e) {
    if (!String(e.body?.error?.message || '').includes('EMAIL_EXISTS')) throw e;
    uid = (await post('accounts:signInWithPassword', { email, password, returnSecureToken: true })).localId;
  }
  // An email only proves identity once Firebase says it is verified — the
  // rules' verifiedEmail() reads that claim, and a client who cannot pass it
  // cannot read their own bookings. The emulator lets the owner set it.
  if (verified) await post('accounts:update', { localId: uid, emailVerified: true }, token);
  return uid;
}

const ADMIN_DEMO = await account('admin@bookit.demo', 'Demo2026!');
const TEAM_DEMO = await account('equipa@bookit.demo', 'equipa2026');
// The individual account goes to Rui, not to Ana. Ana is staff[0] — the
// person tests/team-access.e2e.mjs grants access to — and seeding her with an
// account already in place left two staffAuth rows for the same staffId, so
// loadTeamAccess() resolved to the wrong one.
const RUI = await account('rui@bookit.demo', 'Rui2026!!');
const CLIENT_DEMO = await account('cliente@bookit.demo', 'Cliente2026!', { verified: true });
const ADMIN_ZEN = await account('admin@zen.demo', 'Zen2026!');
const SOFIA = await account('sofia@zen.demo', 'Sofia2026!');

/* ── Dates ────────────────────────────────────────────────────────────────
   Bookings in the future, never on a Sunday (the seeded schedule is closed),
   and derived from today so a seeded salon is always bookable. Two runs on
   the same day produce the same dates, which is what idempotence needs. */
const iso = (d) => d.toISOString().slice(0, 10);
function openDay(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86400000);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}
const past = (daysBack) => {
  const d = new Date(Date.now() - daysBack * 86400000);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
};

/* Monday to Saturday, closed on Sunday — and that closed day is load-bearing:
   tests/engine.e2e.mjs asserts a booking on a Sunday is refused with
   `salon-closed`. Any suite that picks a date at random has to step over
   Sunday itself, the way rules.integration.mjs and waitlist.e2e.mjs do. */
const OPEN_DAY = { open: '09:00', close: '19:00', closed: false };
const CLOSED = { open: '', close: '', closed: true };
const SCHEDULE = {
  monday: OPEN_DAY, tuesday: OPEN_DAY, wednesday: OPEN_DAY,
  thursday: OPEN_DAY, friday: OPEN_DAY, saturday: OPEN_DAY, sunday: CLOSED,
};

const booking = (o) => ({
  clientId: null, clientName: '', clientEmail: '', clientPhone: '', clientPhoneE164: '',
  forSomeone: null, notes: '', discountType: null, discountCode: null,
  referralCode: null, referralDiscount: 0, staffPreference: 'chosen',
  status: 'confirmed', paid: false, source: 'online', createdAt: new Date(), ...o,
});

/* ── The two salons ───────────────────────────────────────────────────────
   `demo` is the tenant every suite points at by default; `zen-organic` is the
   neighbour that must stay unreadable to it. Both are seeded with clients and
   bookings on purpose — an empty neighbour makes the isolation test vacuous. */
const SALONS = [
  {
    id: 'demo',
    doc: {
      name: 'Salão Demo (emulador)', slug: 'demo', adminUid: ADMIN_DEMO,
      teamUid: TEAM_DEMO, teamEmail: 'equipa@bookit.demo',
      tagline: 'Dados de mentira, para testes', address: 'Rua Inventada 1, Lisboa',
      phone: '910000001', email: 'geral@bookit.demo', primaryColor: '#3B6E5A',
      // The booking page reads this one; abuse.e2e checks the public document
      // still carries what the page needs after the private fields moved out.
      timezone: 'Europe/Lisbon',
      plan: 'active', slotInterval: 15, bookingLeadMinutes: 30, maxAdvanceDays: 90,
      cancellationHours: 24, loyaltyVisits: 5, loyaltyDiscount: 20,
      referralDiscount: 10, birthdayDiscount: 15, noShowPenalty: 5,
      pointsPerVisit: 10, closedDates: [], createdAt: new Date('2026-01-05T09:00:00Z'),
    },
    billing: { adminEmail: 'admin@bookit.demo', subscriptionStatus: 'active', planUpdatedAt: new Date('2026-01-05T09:00:00Z') },
    adminUid: ADMIN_DEMO,
    services: [
      ['corte', { name: 'Corte + Brushing', duration: 45, price: 35, order: 1, active: true, description: '' }],
      ['coloracao', { name: 'Coloração', duration: 90, price: 45, order: 2, active: true, description: 'A partir de' }],
      ['tratamento', { name: 'Tratamento', duration: 30, price: 25, order: 3, active: true, description: '' }],
    ],
    staff: [
      ['ana', { name: 'Ana Ribeiro', role: 'Cabeleireira', active: true, serviceIds: [], timeOff: [] }],
      ['rui', { name: 'Rui Matos', role: 'Barbeiro', active: true, serviceIds: ['corte'], uid: RUI, email: 'rui@bookit.demo', timeOff: [] }],
    ],
    staffAuth: [[RUI, { staffId: 'rui', name: 'Rui Matos', email: 'rui@bookit.demo', active: true, createdAt: new Date('2026-02-01T09:00:00Z') }]],
    clients: [
      // A registered client's document id IS their uid — that is how
      // account.html finds it (`doc(db,'salons',id,'clients', u.uid)`), and
      // how the rules let them read and edit their own row. Seeding this one
      // under a readable id like `c-rita` made it invisible to its owner.
      [CLIENT_DEMO, { name: 'Rita Alves', email: 'cliente@bookit.demo', phone: '910000011', uid: CLIENT_DEMO, visits: 3, points: 30, totalSpent: 105, discounts: [], createdAt: new Date('2026-02-10T09:00:00Z') }],
      ['c-joao', { name: 'João Pinto', email: 'joao@bookit.demo', phone: '910000012', visits: 1, points: 10, totalSpent: 35, discounts: [], createdAt: new Date('2026-03-02T09:00:00Z') }],
      ['c-marta', { name: 'Marta Sousa', email: 'marta@bookit.demo', phone: '910000013', visits: 0, points: 0, totalSpent: 0, discounts: [], createdAt: new Date('2026-04-18T09:00:00Z') }],
    ],
    bookings: [
      ['b-demo-1', booking({ salonId: 'demo', clientId: CLIENT_DEMO, clientName: 'Rita Alves', clientEmail: 'cliente@bookit.demo', clientPhone: '910000011', clientPhoneE164: '351910000011', serviceIds: ['corte'], serviceId: 'corte', serviceName: 'Corte + Brushing', serviceDuration: 45, servicePrice: 35, finalPrice: 35, staffId: 'ana', staffName: 'Ana Ribeiro', date: openDay(7), time: '10:00', startMin: 600, endMin: 645 })],
      ['b-demo-2', booking({ salonId: 'demo', clientName: 'João Pinto', clientEmail: 'joao@bookit.demo', clientPhone: '910000012', clientPhoneE164: '351910000012', serviceIds: ['coloracao'], serviceId: 'coloracao', serviceName: 'Coloração', serviceDuration: 90, servicePrice: 45, finalPrice: 45, staffId: 'ana', staffName: 'Ana Ribeiro', date: openDay(9), time: '14:00', startMin: 840, endMin: 930 })],
      ['b-demo-3', booking({ salonId: 'demo', clientName: 'Marta Sousa', clientEmail: 'marta@bookit.demo', clientPhone: '910000013', clientPhoneE164: '351910000013', serviceIds: ['corte'], serviceId: 'corte', serviceName: 'Corte + Brushing', serviceDuration: 45, servicePrice: 35, finalPrice: 35, staffId: 'rui', staffName: 'Rui Matos', date: openDay(12), time: '11:30', startMin: 690, endMin: 735 })],
      ['b-demo-4', booking({ salonId: 'demo', clientId: CLIENT_DEMO, clientName: 'Rita Alves', clientEmail: 'cliente@bookit.demo', clientPhone: '910000011', clientPhoneE164: '351910000011', serviceIds: ['tratamento'], serviceId: 'tratamento', serviceName: 'Tratamento', serviceDuration: 30, servicePrice: 25, finalPrice: 25, staffId: 'ana', staffName: 'Ana Ribeiro', date: past(14), time: '16:00', startMin: 960, endMin: 990, status: 'completed', paid: true })],
    ],
  },
  {
    id: 'zen-organic',
    doc: {
      name: 'Zen Organic (emulador)', slug: 'zen-organic', adminUid: ADMIN_ZEN,
      tagline: 'O salão do lado, que ninguém de fora pode ler',
      address: 'Rua Imaginária 2, Porto', phone: '910000002', email: 'geral@zen.demo',
      primaryColor: '#7A5C3E', timezone: 'Europe/Lisbon', plan: 'active', slotInterval: 15,
      bookingLeadMinutes: 30, maxAdvanceDays: 90, cancellationHours: 24,
      loyaltyVisits: 5, loyaltyDiscount: 20, referralDiscount: 10,
      birthdayDiscount: 15, noShowPenalty: 5, pointsPerVisit: 10,
      closedDates: [], createdAt: new Date('2026-01-20T09:00:00Z'),
    },
    billing: { adminEmail: 'admin@zen.demo', subscriptionStatus: 'active', planUpdatedAt: new Date('2026-01-20T09:00:00Z') },
    adminUid: ADMIN_ZEN,
    services: [
      ['corte', { name: 'Corte', duration: 40, price: 28, order: 1, active: true, description: '' }],
      ['manicure', { name: 'Manicure', duration: 50, price: 22, order: 2, active: true, description: '' }],
    ],
    staff: [
      ['sofia', { name: 'Sofia Nunes', role: 'Cabeleireira', active: true, serviceIds: [], uid: SOFIA, email: 'sofia@zen.demo', timeOff: [] }],
    ],
    staffAuth: [[SOFIA, { staffId: 'sofia', name: 'Sofia Nunes', email: 'sofia@zen.demo', active: true, createdAt: new Date('2026-02-05T09:00:00Z') }]],
    clients: [
      ['c-ines', { name: 'Inês Castro', email: 'ines@zen.demo', phone: '910000021', visits: 2, points: 20, totalSpent: 56, discounts: [], createdAt: new Date('2026-02-20T09:00:00Z') }],
      ['c-pedro', { name: 'Pedro Lima', email: 'pedro@zen.demo', phone: '910000022', visits: 5, points: 50, totalSpent: 140, discounts: [], createdAt: new Date('2026-03-11T09:00:00Z') }],
    ],
    bookings: [
      ['b-zen-1', booking({ salonId: 'zen-organic', clientName: 'Inês Castro', clientEmail: 'ines@zen.demo', clientPhone: '910000021', clientPhoneE164: '351910000021', serviceIds: ['corte'], serviceId: 'corte', serviceName: 'Corte', serviceDuration: 40, servicePrice: 28, finalPrice: 28, staffId: 'sofia', staffName: 'Sofia Nunes', date: openDay(8), time: '10:30', startMin: 630, endMin: 670 })],
      ['b-zen-2', booking({ salonId: 'zen-organic', clientName: 'Pedro Lima', clientEmail: 'pedro@zen.demo', clientPhone: '910000022', clientPhoneE164: '351910000022', serviceIds: ['manicure'], serviceId: 'manicure', serviceName: 'Manicure', serviceDuration: 50, servicePrice: 22, finalPrice: 22, staffId: 'sofia', staffName: 'Sofia Nunes', date: openDay(11), time: '15:00', startMin: 900, endMin: 950 })],
      ['b-zen-3', booking({ salonId: 'zen-organic', clientName: 'Inês Castro', clientEmail: 'ines@zen.demo', clientPhone: '910000021', clientPhoneE164: '351910000021', serviceIds: ['corte'], serviceId: 'corte', serviceName: 'Corte', serviceDuration: 40, servicePrice: 28, finalPrice: 28, staffId: 'sofia', staffName: 'Sofia Nunes', date: past(10), time: '09:30', startMin: 570, endMin: 610, status: 'completed', paid: true })],
    ],
  },
];

console.log(`\nSeed → ${targetSummary()}\n`);

for (const s of SALONS) {
  await write(`salons/${s.id}`, s.doc);
  await write(`salons/${s.id}/config/schedule`, SCHEDULE);
  await write(`salons/${s.id}/private/billing`, s.billing);
  await write(`salons/${s.id}/users/${s.adminUid}`, { email: s.billing.adminEmail, role: 'admin', createdAt: new Date('2026-01-05T09:00:00Z') });
  for (const [col, rows] of [['services', s.services], ['staff', s.staff], ['staffAuth', s.staffAuth], ['clients', s.clients], ['bookings', s.bookings]]) {
    for (const [id, fields] of rows) await write(`salons/${s.id}/${col}/${id}`, fields);
  }
}

/* ── Read back what landed, per salon ─────────────────────────────────────
   Counts read from the emulator, not counted from the arrays above: the point
   is what is in the database, not what we meant to put there. */
console.log('Contagens lidas do emulador:\n');
for (const s of SALONS) {
  const counts = [];
  for (const col of ['config', 'private', 'users', 'services', 'staff', 'staffAuth', 'clients', 'bookings']) {
    counts.push(`${col}=${(await listAll(token, `salons/${s.id}/${col}`)).length}`);
  }
  console.log(`  ${s.id.padEnd(12)} ${counts.join(' ')}`);
}
console.log(`\n✓ ${SALONS.length} salões semeados em ${PROJECT}. Correr outra vez dá o mesmo estado.\n`);
