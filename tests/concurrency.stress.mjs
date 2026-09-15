/* Concurrency stress test: N parallel guests race for the same slot, R rounds.
 * Invariants: exactly one success per round; the agenda never contains
 * overlapping intervals; losers get a clean 'slot-taken'.
 *
 *   node --import ./tests/_register.mjs tests/concurrency.stress.mjs [rounds] [parallel]
 */
import { db, auth, doc, getDoc, deleteDoc, updateDoc, signInWithEmailAndPassword, signOut } from '../firebase.js';
import { loadSalon, loadBookingContext, createBooking, cancelBooking, agendaId, minToTime } from '../app.js';

const E = process.env;
const SALON = E.SALON_ID || 'demo';
const ADMIN = { email: E.ADMIN_EMAIL || 'admin@bookit.demo', pw: E.ADMIN_PASSWORD || 'Demo2026!' };
const ROUNDS = Number(process.argv[2]) || 4, PAR = Number(process.argv[3]) || 3;

const salon = await loadSalon(SALON);
const ctx = await loadBookingContext(SALON);
const service = { id: 'PHsXXzGABGEoeXSwkrJh', name: 'Corte + Brushing', duration: 45, price: 35 };
const S = ctx.staff[1];
const date = (() => { let d = new Date(Date.now() + 52 * 86400000); while (d.getUTCDay() === 0) d = new Date(d.getTime() + 86400000); return d.toISOString().slice(0, 10); })();
const aRef = doc(db, 'salons', SALON, 'agenda', agendaId(S.id, date));
const created = [];
let fail = 0;
console.log(`\nStress — ${ROUNDS} rounds × ${PAR} parallel · ${S.name} · ${date}\n`);
await signOut(auth);

for (let r = 0; r < ROUNDS; r++) {
  const start = 10 * 60 + r * 60; // 10:00, 11:00, 12:00 …
  const attempts = await Promise.allSettled(Array.from({ length: PAR }, (_, i) =>
    createBooking({ salonId: SALON, salon, ctx, service, staff: S, dateStr: date, startMin: start, client: { id: null, name: `STRESS r${r}p${i}`, email: `stress${r}${i}@example.com`, phone: '912345678' }, discount: null })));
  const wins = attempts.filter(a => a.status === 'fulfilled');
  const codes = attempts.filter(a => a.status === 'rejected').map(a => a.reason?.code || a.reason?.message);
  wins.forEach(w => created.push(w.value.id));
  const agenda = (await getDoc(aRef)).data()?.intervals || [];
  const overlap = agenda.some((a, i) => agenda.some((b, j) => i !== j && a.start < b.end && b.start < a.end));
  const okRound = wins.length === 1 && codes.every(c => c === 'slot-taken') && !overlap;
  if (!okRound) fail++;
  console.log(`  ${okRound ? '✓' : '✗'} round ${r + 1} @${minToTime(start)}: ${wins.length} success, losers=[${codes.join(', ')}], agenda overlap=${overlap}`);
}

// cleanup
await signInWithEmailAndPassword(auth, ADMIN.email, ADMIN.pw);
for (const id of created) { try { await cancelBooking({ salonId: SALON, bookingId: id, by: 'admin' }); } catch {} await deleteDoc(doc(db, 'salons', SALON, 'bookings', id)).catch(() => {}); }
const left = (await getDoc(aRef)).data()?.intervals || [];
if (left.length) await updateDoc(aRef, { intervals: left.filter(iv => !created.includes(iv.bookingId)) });
await signOut(auth);
console.log(`\n${fail ? fail + ' round(s) FAILED' : 'all rounds OK'}\n`);
process.exit(fail ? 1 : 0);
