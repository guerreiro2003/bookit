/* Individual staff logins, end to end against the real project.
 *
 * Grant one person their own account → they get exactly the staff powers and
 * nothing more → what they do is stamped with their name → suspending and
 * revoking really cuts them off → and none of it leaks into another salon.
 *
 *   node --import ./tests/_register.mjs tests/team-access.e2e.mjs
 */
import {
  db, auth, doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, query, where,
  signInWithEmailAndPassword, signOut, deleteUser,
} from '../firebase.js';
import {
  loadSalon, loadBookingContext, createBooking, confirmBooking, cancelBooking, agendaId,
  addDaysStr, todayForSalon, setActor, resolveActor,
  grantStaffAccess, revokeStaffAccess, setStaffAccessActive, loadTeamAccess,
} from '../app.js';

import { SALON, ADMIN } from './_target.mjs';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${d}`); } };
const attempt = async (fn) => { try { const v = await fn(); return { allowed: true, v }; } catch (e) { return { allowed: false, code: e.code || e.message }; } };
const refused = (n, r) => ok(n, !r.allowed, `(foi permitido — falha de segurança)`);
const allowed = (n, r) => ok(n, r.allowed, `(${r.code})`);

const salon = await loadSalon(SALON);
const today = todayForSalon(salon);
const stamp = Date.now().toString(36);
const MEMBER = { email: `acesso-${stamp}@bookit.test`, pw: `Teste${stamp.slice(-4)}!x` };
const made = [];

await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
const ctx = await loadBookingContext(SALON);
const S = ctx.staff[0];
const svcSnap = (await getDocs(collection(db, 'salons', SALON, 'services'))).docs[0];
const svc = { id: svcSnap.id, ...svcSnap.data() };
console.log(`\nTeam access E2E — ${salon.name} · ${S.name}\n`);

/* ── the owner grants access ───────────────────────────────────────────── */
const granted = await grantStaffAccess({ salonId: SALON, staffId: S.id, name: S.name, email: MEMBER.email, password: MEMBER.pw });
ok('o dono cria o acesso', !!granted.uid);
const access = await loadTeamAccess(SALON);
ok('o acesso aparece ligado ao colaborador certo', access.get(S.id)?.uid === granted.uid);
ok('e o colaborador guarda o uid', (await getDoc(doc(db, 'salons', SALON, 'staff', S.id))).data().uid === granted.uid);

const dupe = await attempt(() => grantStaffAccess({ salonId: SALON, staffId: S.id, name: S.name, email: MEMBER.email, password: MEMBER.pw }));
ok('o mesmo email não pode ter duas contas', !dupe.allowed && dupe.code === 'email-in-use', dupe.code);
const weak = await attempt(() => grantStaffAccess({ salonId: SALON, staffId: S.id, name: S.name, email: `x-${stamp}@bookit.test`, password: 'curta' }));
ok('password curta é recusada antes de criar seja o que for', !weak.allowed && weak.code === 'weak-password', weak.code);

/* ── the person signs in as themselves ─────────────────────────────────── */
await signOut(auth);
await signInWithEmailAndPassword(auth, MEMBER.email, MEMBER.pw);
const actor = await resolveActor(SALON, salon, auth.currentUser);
ok('é reconhecida como membro desta equipa', actor?.role === 'member' && actor.staffId === S.id, JSON.stringify(actor));
ok('e com o nome dela, não "equipa"', actor?.name === S.name, actor?.name);
setActor(actor);

allowed('lê as marcações do salão', await attempt(() => getDocs(collection(db, 'salons', SALON, 'bookings'))));
allowed('lê as fichas de clientes', await attempt(() => getDocs(collection(db, 'salons', SALON, 'clients'))));

/* ── what she does carries her name ────────────────────────────────────── */
const far = addDaysStr(today, 410);
const made1 = await createBooking({
  salonId: SALON, salon, ctx, service: svc, staff: S, dateStr: far, startMin: 10 * 60,
  client: { id: null, name: 'ACCESS-TEST cliente', email: '', phone: '919 000 555' },
  discount: null, source: 'admin', status: 'pending',
});
made.push(made1.id);
await confirmBooking({ salonId: SALON, bookingId: made1.id });
let b = (await getDoc(doc(db, 'salons', SALON, 'bookings', made1.id))).data();
ok('confirmar fica registado com quem confirmou', b.confirmedByUid === granted.uid && b.confirmedByName === S.name, JSON.stringify({ u: b.confirmedByUid, n: b.confirmedByName }));
await cancelBooking({ salonId: SALON, bookingId: made1.id, by: 'salon' });
b = (await getDoc(doc(db, 'salons', SALON, 'bookings', made1.id))).data();
ok('cancelar também', b.cancelledByUid === granted.uid && b.cancelledByName === S.name, JSON.stringify({ u: b.cancelledByUid, n: b.cancelledByName }));

/* ── but she is not the owner ──────────────────────────────────────────── */
refused('não muda as definições do salão', await attempt(() => updateDoc(doc(db, 'salons', SALON), { name: salon.name, slotInterval: 30 })));
refused('não apaga clientes', await attempt(async () => {
  const c = (await getDocs(collection(db, 'salons', SALON, 'clients'))).docs[0];
  if (!c) throw Object.assign(new Error('sem-clientes'), { code: 'sem-clientes' });
  return deleteDoc(c.ref);
}));
refused('não dá acesso a mais ninguém', await attempt(() => setDoc(doc(db, 'salons', SALON, 'staffAuth', 'UID-INVENTADO'), { staffId: S.id, name: 'X', active: true })));
refused('não se promove a si própria a dona', await attempt(() => updateDoc(doc(db, 'salons', SALON), { adminUid: auth.currentUser.uid, name: salon.name })));
refused('não lista quem mais tem acesso', await attempt(() => getDocs(collection(db, 'salons', SALON, 'staffAuth'))));
allowed('mas lê a sua própria entrada', await attempt(() => getDoc(doc(db, 'salons', SALON, 'staffAuth', granted.uid))));

/* ── and has no reach into another salon ───────────────────────────────── */
await signOut(auth);
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
const others = (await getDocs(collection(db, 'salons'))).docs.map(d => d.id).filter(id => id !== SALON);
await signOut(auth);
await signInWithEmailAndPassword(auth, MEMBER.email, MEMBER.pw);
if (others.length) {
  refused(`não lê clientes de "${others[0]}"`, await attempt(() => getDocs(collection(db, 'salons', others[0], 'clients'))));
  refused(`não lê marcações de "${others[0]}"`, await attempt(() => getDocs(collection(db, 'salons', others[0], 'bookings'))));
} else console.log('  ⚪ só há um salão — alcance entre salões não testável');

/* ── suspending really cuts her off ────────────────────────────────────── */
await signOut(auth);
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
await setStaffAccessActive({ salonId: SALON, uid: granted.uid, active: false });
await signOut(auth);
await signInWithEmailAndPassword(auth, MEMBER.email, MEMBER.pw);
ok('suspensa, deixa de ser reconhecida', (await resolveActor(SALON, salon, auth.currentUser)) === null);
refused('e perde o acesso aos dados', await attempt(() => getDocs(collection(db, 'salons', SALON, 'clients'))));

await signOut(auth);
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
await setStaffAccessActive({ salonId: SALON, uid: granted.uid, active: true });
await signOut(auth);
await signInWithEmailAndPassword(auth, MEMBER.email, MEMBER.pw);
allowed('reativada, volta a entrar', await attempt(() => getDocs(collection(db, 'salons', SALON, 'clients'))));

/* ── revoking is final ─────────────────────────────────────────────────── */
await signOut(auth);
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
await revokeStaffAccess({ salonId: SALON, staffId: S.id, uid: granted.uid });
ok('o colaborador deixa de ter uid', !(await getDoc(doc(db, 'salons', SALON, 'staff', S.id))).data().uid);
await signOut(auth);
await signInWithEmailAndPassword(auth, MEMBER.email, MEMBER.pw);
refused('removida, não lê nada', await attempt(() => getDocs(collection(db, 'salons', SALON, 'clients'))));
ok('o histórico do que ela fez mantém-se', (await (async () => {
  await signOut(auth); await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
  return (await getDoc(doc(db, 'salons', SALON, 'bookings', made1.id))).data();
})()).cancelledByName === S.name, 'quem saiu não apaga o rasto');

/* ── the shared password still works, so nobody is locked out mid-migration ── */
await signOut(auth);
const teamActor = await resolveActor(SALON, salon, { uid: salon.teamUid });
ok('a password partilhada continua a valer durante a migração', teamActor?.role === 'team');

/* ── cleanup ───────────────────────────────────────────────────────────── */
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
for (const id of made) {
  const s = await getDoc(doc(db, 'salons', SALON, 'bookings', id));
  if (!s.exists()) continue;
  const bk = s.data();
  const aRef = doc(db, 'salons', SALON, 'agenda', agendaId(bk.staffId, bk.date));
  const a = await getDoc(aRef);
  if (a.exists() && (a.data().byBooking || {})[id]) await updateDoc(aRef, { [`byBooking.${id}`]: (await import('../firebase.js')).deleteField(), viaBookingId: id }).catch(() => {});
  if (bk.manageToken) await deleteDoc(doc(db, 'salons', SALON, 'bookingLinks', bk.manageToken)).catch(() => {});
  await deleteDoc(s.ref);
}
await deleteDoc(doc(db, 'salons', SALON, 'staffAuth', granted.uid)).catch(() => {});
await updateDoc(doc(db, 'salons', SALON, 'staff', S.id), { uid: null }).catch(() => {});
await signOut(auth);
try { await signInWithEmailAndPassword(auth, MEMBER.email, MEMBER.pw); await deleteUser(auth.currentUser); }
catch (e) { console.log('  ! conta de teste ficou por apagar:', e.code); }
await signOut(auth);
setActor(null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
