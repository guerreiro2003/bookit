/* Abuse suite — the attacks, not the happy path.
 *
 * Every other suite asks "can the person with the right do it?". This one asks
 * "can someone WITHOUT the right do it by another road?". Two of these were
 * live holes found in the September 2026 audit and exploited against production
 * before being closed; they are here so they can never come back.
 *
 * A test passes when the attack is REFUSED.
 *
 *   node --import ./tests/_register.mjs tests/abuse.e2e.mjs
 */
import {
  db, auth, doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, query, where,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, deleteUser,
} from '../firebase.js';
import { addDaysStr, todayForSalon, loadSalon } from '../app.js';

import { SALON, ADMIN } from './_target.mjs';

let pass = 0, fail = 0;
const attempt = async (fn) => { try { await fn(); return { allowed: true }; } catch (e) { return { allowed: false, code: e.code || e.message }; } };
/** The attack must be refused. */
const refused = (name, r) => {
  if (!r.allowed) { pass++; console.log(`  ✓ recusado · ${name}`); }
  else { fail++; console.log(`  ✗ PERMITIDO · ${name}  ← falha de segurança`); }
};
/** A plain assertion, for facts that are not an attempt at anything. */
const ok = (name, cond, d = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${d}`); }
};
/** The legitimate path must still work. */
const allowed = (name, r) => {
  if (r.allowed) { pass++; console.log(`  ✓ permitido · ${name}`); }
  else { fail++; console.log(`  ✗ BLOQUEADO · ${name} (${r.code})  ← partimos um caminho legítimo`); }
};

const salon = await loadSalon(SALON);
const today = todayForSalon(salon);
// Far enough out to never collide with real work, and a different day on each
// run: a crash mid-suite leaves documents behind, and a fixed date would make
// the NEXT run fail on a slot that is legitimately taken — a flaky test that
// cries wolf about security is worse than no test.
const DAY = 400 + (Date.now() % 40);
const FAR = addDaysStr(today, DAY);
const tidy = [];

await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
const staff = (await getDocs(collection(db, 'salons', SALON, 'staff'))).docs.map(d => ({ id: d.id, ...d.data() }));
const svcSnap = (await getDocs(collection(db, 'salons', SALON, 'services'))).docs[0];
const svc = { id: svcSnap.id, ...svcSnap.data() };
const S = staff[0];
console.log(`\nAbuse suite — ${salon.name} · alvo ${S.name} · ${FAR}\n`);

/* ══ 1. Agenda: an entry must shadow a real booking ══════════════════════
   The hole: the rules validated the SHAPE of an agenda document but never
   checked the entry belonged to a booking. Anyone without a login could mark
   a stylist busy 00:00–24:00 for a booking that did not exist, closing the
   salon's calendar while the booking list stayed empty.                     */
console.log('AGENDA — uma entrada é a sombra de uma marcação real');
await signOut(auth);
const agRef = doc(db, 'salons', SALON, 'agenda', `${S.id}__${FAR}`);
tidy.push(agRef);

refused('anónimo bloqueia o dia inteiro com uma marcação inventada', await attempt(() => setDoc(agRef, {
  staffId: S.id, date: FAR, viaBookingId: 'NAO-EXISTE',
  byBooking: { 'NAO-EXISTE': { blocks: [{ start: 0, end: 1440 }] } }, updatedAt: new Date(),
})));

refused('anónimo bloqueia o dia sem sequer declarar a marcação', await attempt(() => setDoc(agRef, {
  staffId: S.id, date: FAR,
  byBooking: { qualquer: { blocks: [{ start: 0, end: 1440 }] } }, updatedAt: new Date(),
})));

/* the legitimate road: a real booking first, then its own hold */
const bookingFields = (over = {}) => ({
  salonId: SALON, clientId: null, clientName: 'ABUSE-TEST visitante', clientEmail: '',
  clientPhone: '919 000 111', clientPhoneE164: '351919000111',
  serviceIds: [svc.id], serviceId: svc.id, serviceName: svc.name,
  serviceDuration: svc.duration, servicePrice: svc.price, finalPrice: svc.price,
  staffId: S.id, staffName: S.name, date: FAR, time: '10:00',
  startMin: 600, endMin: 600 + svc.duration, status: 'pending', paid: false,
  source: 'online', manageToken: null, createdAt: new Date(), ...over,
});
const realRef = doc(collection(db, 'salons', SALON, 'bookings'));
tidy.push(realRef);
allowed('uma marcação online normal é aceite', await attempt(() => setDoc(realRef, bookingFields())));
allowed('e pode segurar o seu próprio horário na agenda', await attempt(() => setDoc(agRef, {
  staffId: S.id, date: FAR, viaBookingId: realRef.id,
  byBooking: { [realRef.id]: { blocks: [{ start: 600, end: 600 + svc.duration }] } }, updatedAt: new Date(),
})));
refused('mas não pode esticar os blocos para além da própria marcação', await attempt(() => updateDoc(agRef, {
  [`byBooking.${realRef.id}`]: { blocks: [{ start: 0, end: 1440 }] }, viaBookingId: realRef.id, updatedAt: new Date(),
})));
refused('nem acrescentar uma entrada fantasma ao lado da sua', await attempt(() => updateDoc(agRef, {
  'byBooking.FANTASMA': { blocks: [{ start: 700, end: 760 }] }, viaBookingId: 'FANTASMA', updatedAt: new Date(),
})));
refused('nem varrer o dia de outra pessoa', await attempt(() => setDoc(agRef, {
  staffId: S.id, date: FAR, viaBookingId: realRef.id, byBooking: {}, updatedAt: new Date(),
})));

/* ══ 2. bookingLinks: only for a booking you actually made ══════════════ */
console.log('\nLINKS — só para uma marcação que exista');
const junk = doc(db, 'salons', SALON, 'bookingLinks', 'abuse' + Math.random().toString(16).slice(2, 12));
tidy.push(junk);
refused('anónimo escreve documentos arbitrários (negação de carteira)', await attempt(() => setDoc(junk, {
  salonId: SALON, bookingId: 'NAO-EXISTE', status: 'pending',
})));
refused('tokens não são enumeráveis', await attempt(() => getDocs(collection(db, 'salons', SALON, 'bookingLinks'))));

/* ══ 3. Identity: an email only counts once it has been verified ═════════
   The hole: the rules trusted request.auth.token.email. Firebase lets anyone
   register with any address, so registering as the victim handed over their
   name, phone, visit history and the salon's private notes — which in a salon
   include allergies.                                                        */
console.log('\nIDENTIDADE — um email só conta depois de verificado');
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
const VICTIM = `abuse-victim-${Date.now().toString(36)}@bookit.test`;
const victimRef = doc(db, 'salons', SALON, 'bookings', `ABUSE-VICTIM-${Date.now().toString(36)}`);
tidy.push(victimRef);
await setDoc(victimRef, bookingFields({
  clientName: 'ABUSE-TEST vítima', clientEmail: VICTIM, clientPhone: '919 000 222',
  clientPhoneE164: '351919000222', date: addDaysStr(today, DAY + 1), time: '10:00',
  status: 'confirmed', source: 'admin', notes: 'NOTA PRIVADA: alergia a amoníaco',
}));
await signOut(auth);

let attacker = null;
const read = await attempt(async () => {
  const cred = await createUserWithEmailAndPassword(auth, VICTIM, 'AtacanteQualquer123!');
  attacker = { email: VICTIM, pw: 'AtacanteQualquer123!' };
  if (cred.user.emailVerified) throw new Error('inesperado: conta nova já verificada');
  const s = await getDoc(victimRef);
  if (!s.exists()) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
});
refused('conta com o email da vítima (não verificado) lê a marcação dela', read);
refused('...e cancela a marcação dela', await attempt(() => updateDoc(victimRef, {
  status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'client', previousStatus: 'confirmed',
})));
refused('...e apaga os dados pessoais dela (RGPD)', await attempt(() => updateDoc(victimRef, {
  clientName: '—', clientEmail: '', clientPhone: '', clientPhoneE164: null,
  notes: '', forSomeone: null, clientId: null, anonymised: true, anonymisedAt: new Date(),
})));
refused('...e lê a ficha de cliente dela', await attempt(() => getDocs(
  query(collection(db, 'salons', SALON, 'clients'), where('email', '==', VICTIM)))));

/* ══ 4. A booking must land on someone who does the work ════════════════
   Otherwise a client can force a colour onto a barber who has never done one,
   simply by posting the staff id from the public staff list.               */
console.log('\nQUEM FAZ O QUÊ');
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
const allSvc = (await getDocs(collection(db, 'salons', SALON, 'services'))).docs.map(d => ({ id: d.id, ...d.data() }));
const otherSvc = allSvc.find(s => s.id !== svc.id && s.active !== false);
const staffRef = doc(db, 'salons', SALON, 'staff', S.id);
const savedServiceIds = Array.isArray(S.serviceIds) ? S.serviceIds : null;
if (otherSvc) {
  // restrict this person to ONE service, then try to book them for the other
  await updateDoc(staffRef, { serviceIds: [svc.id] });
  await signOut(auth);
  refused(`cliente marca "${otherSvc.name}" com quem só faz "${svc.name}"`, await attempt(() => setDoc(doc(collection(db, 'salons', SALON, 'bookings')), bookingFields({
    serviceIds: [otherSvc.id], serviceId: otherSvc.id, serviceName: otherSvc.name,
    serviceDuration: otherSvc.duration, servicePrice: otherSvc.price, finalPrice: otherSvc.price,
    date: addDaysStr(today, DAY + 3), endMin: 600 + otherSvc.duration,
  }))));
  const combo = doc(collection(db, 'salons', SALON, 'bookings'));
  refused('nem numa combinação onde só metade é dela', await attempt(() => setDoc(combo, bookingFields({
    serviceIds: [svc.id, otherSvc.id], serviceId: svc.id, serviceName: `${svc.name} + ${otherSvc.name}`,
    serviceDuration: svc.duration + otherSvc.duration, servicePrice: svc.price + otherSvc.price,
    finalPrice: svc.price + otherSvc.price, date: addDaysStr(today, DAY + 3), endMin: 600 + svc.duration + otherSvc.duration,
  }))));
  const okRef = doc(collection(db, 'salons', SALON, 'bookings'));
  tidy.push(okRef);
  allowed('mas o serviço que ela faz continua a passar', await attempt(() => setDoc(okRef, bookingFields({ date: addDaysStr(today, DAY + 3) }))));
  // back to "does everything" and the restriction disappears
  await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
  await updateDoc(staffRef, { serviceIds: [] });
  await signOut(auth);
  const freeRef = doc(collection(db, 'salons', SALON, 'bookings'));
  tidy.push(freeRef);
  allowed('sem lista, volta a fazer tudo', await attempt(() => setDoc(freeRef, bookingFields({
    serviceIds: [otherSvc.id], serviceId: otherSvc.id, serviceName: otherSvc.name,
    serviceDuration: otherSvc.duration, servicePrice: otherSvc.price, finalPrice: otherSvc.price,
    date: addDaysStr(today, DAY + 4), endMin: 600 + otherSvc.duration,
  }))));
  await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
  await updateDoc(staffRef, savedServiceIds ? { serviceIds: savedServiceIds } : { serviceIds: [] });
} else console.log('  ⚪ só há um serviço — restrição por colaborador não testável');

/* ══ 5. What the public salon document is allowed to carry ══════════════
   It has `allow read: if true` — the booking page needs the name, the colour
   and the opening rules with nobody signed in. It must not also hand out the
   owner's email address or the commercial relationship.                    */
console.log('\nO QUE É PÚBLICO');
await signOut(auth);
const pub = (await getDoc(doc(db, 'salons', SALON))).data();
for (const f of ['adminEmail', 'subscriptionStatus', 'planUpdatedAt']) {
  ok(`"${f}" não viaja no documento público`, pub[f] === undefined, `(valor: ${JSON.stringify(pub[f])})`);
}
ok('mas o que a página de marcação precisa continua lá', !!pub.name && !!pub.timezone && pub.plan !== undefined);
refused('anónimo não lê a coleção privada', await attempt(() => getDoc(doc(db, 'salons', SALON, 'private', 'billing'))));
refused('nem a lista', await attempt(() => getDocs(collection(db, 'salons', SALON, 'private'))));
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
allowed('o dono lê a sua', await attempt(() => getDoc(doc(db, 'salons', SALON, 'private', 'billing'))));

/* ══ 6. Money and tenancy — already solid, kept so they stay that way ════ */
console.log('\nDINHEIRO E SEPARAÇÃO ENTRE SALÕES');
await signOut(auth);
refused('cliente forja o preço do serviço', await attempt(() => setDoc(doc(collection(db, 'salons', SALON, 'bookings')),
  bookingFields({ servicePrice: 0.01, finalPrice: 0.01, date: addDaysStr(today, DAY + 2) }))));
refused('cliente marca já confirmada e paga', await attempt(() => setDoc(doc(collection(db, 'salons', SALON, 'bookings')),
  bookingFields({ status: 'confirmed', paid: true, date: addDaysStr(today, DAY + 2) }))));
refused('anónimo lê a lista de clientes', await attempt(() => getDocs(collection(db, 'salons', SALON, 'clients'))));
refused('anónimo lê a lista de marcações', await attempt(() => getDocs(collection(db, 'salons', SALON, 'bookings'))));

await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
const others = (await getDocs(collection(db, 'salons'))).docs.map(d => d.id).filter(id => id !== SALON);
if (others.length) {
  const other = others[0];
  refused(`admin do "${SALON}" lê clientes de "${other}"`, await attempt(() => getDocs(collection(db, 'salons', other, 'clients'))));
  refused(`admin do "${SALON}" lê marcações de "${other}"`, await attempt(() => getDocs(collection(db, 'salons', other, 'bookings'))));
  refused(`admin do "${SALON}" escreve em "${other}"`, await attempt(() => setDoc(doc(db, 'salons', other, 'services', 'ABUSE-CROSS'), { name: 'X', price: 1, duration: 10 })));
  refused(`admin do "${SALON}" muda o dono de "${other}"`, await attempt(() => updateDoc(doc(db, 'salons', other), { adminUid: auth.currentUser.uid })));
} else console.log('  ⚪ só existe um salão — separação entre salões não testável');

// Billing is not the salon's to edit. Note a no-op write of the same value is
// fine and allowed — the rule looks at what CHANGED — so these ask for a real change.
const otherPlan = salon.plan === 'active' ? 'trial' : 'active';
refused('admin muda o próprio plano de subscrição', await attempt(() => updateDoc(doc(db, 'salons', SALON), { plan: otherPlan, name: salon.name })));
refused('admin estica o próprio período de teste', await attempt(() => updateDoc(doc(db, 'salons', SALON), { trialEndsAt: new Date(Date.now() + 3650 * 864e5), name: salon.name })));
refused('admin marca a própria subscrição como paga', await attempt(() => updateDoc(doc(db, 'salons', SALON), { subscriptionStatus: 'paid', name: salon.name })));
refused('admin toma posse do salão com outro uid', await attempt(() => updateDoc(doc(db, 'salons', SALON), { adminUid: 'outro-uid-qualquer', name: salon.name })));

/* ── limpeza ────────────────────────────────────────────────────────────── */
console.log('\n— limpeza —');
if (attacker) {
  try { await signOut(auth); await signInWithEmailAndPassword(auth, attacker.email, attacker.pw); await deleteUser(auth.currentUser); }
  catch (e) { console.log('  ! conta de teste ficou por apagar:', e.code); }
}
await signOut(auth);
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
for (const ref of tidy) await deleteDoc(ref).catch(() => {});
// Sweep by name as well as by reference: a run that crashes before this point
// leaves documents behind, and they were showing up weeks later in the week view.
for (const name of ['ABUSE-TEST visitante', 'ABUSE-TEST vítima']) {
  for (const d of (await getDocs(query(collection(db, 'salons', SALON, 'bookings'), where('clientName', '==', name)))).docs) {
    await deleteDoc(d.ref).catch(() => {});
  }
}
await signOut(auth);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
