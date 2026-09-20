/* One-off: move owner-only fields off the publicly readable salon document.
 *
 *   node scripts/migrate-private.mjs            # dry run
 *   node scripts/migrate-private.mjs --yes
 *
 * `salons/{id}` has `allow read: if true` — the booking page needs the name,
 * the colour and the opening rules without anyone signing in. It was also
 * carrying the owner's own email address and the commercial relationship,
 * which anyone could read. Those move to `salons/{id}/private/billing`.
 *
 * `plan` and `trialEndsAt` stay put: the security rules read them on every
 * booking, and moving them would add a lookup to the hottest path in the app.
 * Knowing a salon takes bookings is not a secret; knowing what it pays is.
 */
import { ownerToken, listAll, getDocument, patchDocument, api, toValue, FS } from './_lib.mjs';

const MOVE = ['adminEmail', 'subscriptionStatus', 'planUpdatedAt'];
const apply = process.argv.includes('--yes');
const token = await ownerToken();
const salons = await listAll(token, 'salons');

console.log(`\n${apply ? 'A MIGRAR' : 'SIMULAÇÃO'} — ${salons.length} salão(ões)\n`);
let moved = 0;

for (const s of salons) {
  const present = MOVE.filter(f => s[f] !== undefined);
  if (!present.length) { console.log(`── ${s.id}: nada a mover`); continue; }
  console.log(`── ${s.id}: ${present.join(', ')}`);
  if (!apply) continue;

  const billing = Object.fromEntries(present.map(f => [f, s[f]]));
  await patchDocument(token, `salons/${s.id}/private/billing`, billing);

  // Firestore has no "delete these fields" in a PATCH, so rewrite the salon
  // document without them, using an update mask that names every field.
  const { [MOVE[0]]: _a, [MOVE[1]]: _b, [MOVE[2]]: _c, id, path, ...keep } = s;
  const mask = [...Object.keys(keep), ...MOVE].map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  await api('PATCH', `${FS}/salons/${s.id}?${mask}`, token, {
    fields: Object.fromEntries(Object.entries(keep).map(([k, v]) => [k, toValue(v)])),
  });
  moved++;
}

if (!apply) { console.log('\nNada foi escrito. Junta --yes.\n'); process.exit(0); }

/* ── verify ─────────────────────────────────────────────────────────────── */
console.log('\n— verificação —');
let bad = 0;
for (const s of salons) {
  const after = await getDocument(token, `salons/${s.id}`);
  const still = MOVE.filter(f => after[f] !== undefined);
  const billing = await getDocument(token, `salons/${s.id}/private/billing`);
  const had = MOVE.filter(f => s[f] !== undefined);
  if (still.length) { console.log(`✗ ${s.id}: ainda público — ${still.join(', ')}`); bad++; }
  else if (had.length && !billing) { console.log(`✗ ${s.id}: movido mas private/billing não existe`); bad++; }
  else if (had.length) console.log(`✓ ${s.id}: ${had.join(', ')} agora só para o dono`);
  else console.log(`· ${s.id}: nada a fazer`);
}
console.log(`\n${moved} salão(ões) migrado(s)${bad ? `, ${bad} com problemas` : ''}\n`);
process.exit(bad ? 1 : 0);
