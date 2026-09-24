/* E2E of the importer against the real project: a CSV exported from another
 * salon software becomes clients + history, the rules accept it, the retention
 * engine immediately has something to say, and re-importing the same file
 * updates instead of duplicating.
 *
 *   node --import ./tests/_register.mjs tests/import.e2e.mjs
 */
import { db, auth, doc, getDoc, getDocs, collection, deleteDoc, setDoc, signInWithEmailAndPassword, signOut } from '../firebase.js';
import { loadSalon, loadImportContext, runImport, loadRetention, addDaysStr, todayForSalon } from '../app.js';
import { analyseImport } from '../import-core.js';
import { buildClientProfiles, reactivationCandidates } from '../retention-core.js';

import { SALON, ADMIN } from './_target.mjs';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${d}`); } };
const expectErr = async (n, fn, code) => { try { await fn(); ok(n, false, `(expected ${code}, got success)`); } catch (e) { ok(n, e.code === code, `(expected ${code}, got ${e.code || e.message})`); } };

const salon = await loadSalon(SALON);
const today = todayForSalon(salon);
const d = (back) => addDaysStr(today, -back).split('-').reverse().join('/');   // dd/mm/yyyy, as Excel exports it
console.log(`\nImport E2E — ${salon.name} · hoje ${today}\n`);

/* A file shaped like a real export: PT headers, ';', dd/mm/yyyy, "35,00 €". */
const CSV = [
  'Data;Hora;Cliente;Telemóvel;Serviço;Valor;Profissional',
  `${d(200)};10:00;IMP-TEST Ana;919 000 801;Corte + Brushing;35,00 €;Ana`,
  `${d(160)};11:30;IMP-TEST Ana;919000801;Corte + Brushing;35,00 €;Ana`,
  `${d(120)};10:00;IMP-TEST Ana;919000801;Coloração;60,00 €;Ana`,
  `${d(30)};09:30;IMP-TEST Rui;919 000 802;Corte Masculino;15,00 €;Ana`,
  `${d(-10)};09:30;IMP-TEST Futuro;919000803;Corte Masculino;15,00 €;Ana`,   // future → rejected
  'lixo;;;;;;',
].join('\n');

await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
const ctx = await loadImportContext(SALON);
ok('import context reads clients + services', Array.isArray(ctx.clients) && ctx.services.length > 0);

/* ── analysis, before anything is written ── */
const a = analyseImport({ text: CSV, existingClients: ctx.clients, services: ctx.services, today });
ok('detected a visit history', a.ok && a.kind === 'visits');
ok('4 usable visits, 2 rejected', a.summary.valid === 4 && a.summary.invalid === 2, `(${a.summary.valid}/${a.summary.invalid})`);
ok('future visit rejected as not-history', a.rows.some(r => r.errors.includes('data no futuro')));
ok('2 new clients found', a.summary.newClients === 2, `(${a.summary.newClients})`);
ok('revenue read with Portuguese decimals', a.summary.revenue === 145, `(${a.summary.revenue})`);
ok('services matched against the catalogue', a.rows[0].visit.serviceId !== '');

/* ── write ── */
let progressSeen = 0;
const res = await runImport({ salonId: SALON, analysis: a, onProgress: () => progressSeen++ });
ok('clients created', res.clientsCreated === 2, JSON.stringify(res));
ok('visits written', res.visitsWritten === 4, JSON.stringify(res));
ok('nothing failed the rules', res.failed.length === 0, JSON.stringify(res.failed));
ok('progress was reported', progressSeen === 6, `(${progressSeen})`);

const written = a.rows.filter(r => r.ok).map(r => r.docId);
const first = await getDoc(doc(db, 'salons', SALON, 'bookings', written[0]));
ok('booking stored as completed history', first.exists() && first.data().status === 'completed' && first.data().paid === true);
ok('marked as imported, so it is never confused with real traffic', first.data().imported === true && first.data().source === 'import');

/* ── history must not block the agenda: past days are not held ── */
const b0 = first.data();
const ag = await getDoc(doc(db, 'salons', SALON, 'agenda', `${b0.staffId}_${b0.date}`));
ok('imported history does not occupy the agenda', !ag.exists() || !(ag.data().byBooking || {})[written[0]]);

/* ── counters ── */
const clients = await getDocs(collection(db, 'salons', SALON, 'clients'));
const ana = clients.docs.map(x => ({ id: x.id, ...x.data() })).find(c => c.name === 'IMP-TEST Ana');
ok('client counters rebuilt from the history', ana && ana.visits === 3 && ana.totalSpent === 130, JSON.stringify({ v: ana?.visits, s: ana?.totalSpent }));
ok('phone stored in E.164, so identity matches everywhere', ana?.phoneE164 === '351919000801');

/* ── the point of all this: the salon can act on day one ── */
const { bookings, reactivations } = await loadRetention({ salonId: SALON, salon });
const { profiles } = buildClientProfiles({ bookings, today, reactivations });
const anaP = profiles.find(p => p.key === '351919000801');
ok('cadence computed from imported history', anaP && anaP.visits === 3 && anaP.cadenceDays > 0, JSON.stringify({ v: anaP?.visits, c: anaP?.cadenceDays, src: anaP?.cadenceSource }));
ok('cadence comes from her own rhythm, not a guess', anaP?.cadenceSource === 'own', `(${anaP?.cadenceSource})`);
const cands = reactivationCandidates(profiles);
ok('imported client surfaces as reactivable', cands.some(c => c.key === '351919000801'), `(${cands.length} candidatos)`);

/* ── idempotence: the same file again must not duplicate ── */
const ctx2 = await loadImportContext(SALON);
const a2 = analyseImport({ text: CSV, existingClients: ctx2.clients, services: ctx2.services, today });
ok('second pass recognises the clients already exist', a2.summary.matchedExisting === 2 && a2.summary.newClients === 0, JSON.stringify(a2.summary));
const res2 = await runImport({ salonId: SALON, analysis: a2, onProgress: null });
ok('no duplicate clients created', res2.clientsCreated === 0 && res2.clientsUpdated === 2, JSON.stringify(res2));
ok('same document ids → visits updated, not duplicated', res2.visitsWritten === 4 && res2.failed.length === 0);
const all = await getDocs(collection(db, 'salons', SALON, 'bookings'));
ok('booking count unchanged after re-import', all.docs.filter(x => x.id.startsWith('imp_')).length === 4, `(${all.docs.filter(x => x.id.startsWith('imp_')).length})`);
const ana2 = (await getDocs(collection(db, 'salons', SALON, 'clients'))).docs.map(x => x.data()).filter(c => c.name === 'IMP-TEST Ana');
ok('still exactly one Ana', ana2.length === 1, `(${ana2.length})`);
ok('counters not double-counted', ana2[0]?.visits === 3 && ana2[0]?.totalSpent === 130);

/* ── the rules must not let an import become a free-for-all ── */
await expectErr('a future "import" is rejected by the rules', () => setDoc(doc(db, 'salons', SALON, 'bookings', 'IMP-PROBE-future'), {
  salonId: SALON, imported: true, source: 'import', clientId: null, clientName: 'IMP-TEST Probe', clientEmail: '', clientPhone: '', clientPhoneE164: null,
  serviceIds: [], serviceId: '', serviceName: 'X', serviceDuration: 45, servicePrice: 10, finalPrice: 10,
  staffId: 'importado', staffName: 'Importado', date: addDaysStr(today, 5), time: '10:00', startMin: 600, endMin: 645,
  status: 'completed', paid: true, manageToken: null, createdAt: new Date(),
}), 'permission-denied');

await signOut(auth);
await expectErr('a logged-out visitor cannot import', () => setDoc(doc(db, 'salons', SALON, 'bookings', 'IMP-PROBE-anon'), {
  salonId: SALON, imported: true, source: 'import', clientId: null, clientName: 'IMP-TEST Probe', clientEmail: '', clientPhone: '', clientPhoneE164: null,
  serviceIds: [], serviceId: '', serviceName: 'X', serviceDuration: 45, servicePrice: 10, finalPrice: 10,
  staffId: 'importado', staffName: 'Importado', date: addDaysStr(today, -5), time: '10:00', startMin: 600, endMin: 645,
  status: 'completed', paid: true, manageToken: null, createdAt: new Date(),
}), 'permission-denied');

/* ── cleanup ── */
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
for (const id of new Set([...written, ...a2.rows.filter(r => r.ok).map(r => r.docId)])) await deleteDoc(doc(db, 'salons', SALON, 'bookings', id)).catch(() => {});
for (const x of (await getDocs(collection(db, 'salons', SALON, 'clients'))).docs) if ((x.data().name || '').startsWith('IMP-TEST')) await deleteDoc(x.ref);
await signOut(auth);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
