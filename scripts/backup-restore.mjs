/* Operator-only: restore one salon from a backup-export JSON into the project.
 * Writes documents with their original ids; existing documents are overwritten.
 * Bypasses security rules.
 *
 *   node scripts/backup-restore.mjs <backup.json> <salonId>                 # dry run
 *   node scripts/backup-restore.mjs <backup.json> <salonId> --yes           # over the live salon
 *   node scripts/backup-restore.mjs <backup.json> <salonId> --as novo --yes # into a fresh id
 *
 * `--as` exists so a restore can be REHEARSED without touching anything live —
 * restore beside the real salon, look at it, then delete it. A recovery plan
 * nobody has ever run is a hope, not a plan.
 *
 * `--as` is NOT a way to move or clone a salon into production. The copy comes
 * back owned by nobody: no adminUid, no team login, every staffAuth entry
 * inactive (see restore-ownership.mjs for why, and for what it deliberately
 * leaves alone). Nobody can sign in to it, and that is the point — two salons
 * answering to the same owner uid is how the owner's own panel ends up showing
 * the copy. Migrating a salon to a new id is a different job, and it needs a
 * script that moves the ownership across on purpose.
 *
 * Delete the copy when the rehearsal ends: it is still publicly readable, like
 * every salon document.
 */
import fs from 'node:fs';
import { ownerToken, api, listAll, FS, toValue } from './_lib.mjs';
import { neutraliseOwnership, activeOwnershipIn } from './restore-ownership.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--yes');
const asIdx = args.indexOf('--as');
const target = asIdx !== -1 ? args[asIdx + 1] : null;
const [file, salonId] = args.filter((a, i) => !a.startsWith('--') && i !== asIdx + 1);

if (!file || !salonId) {
  console.error('usage: node scripts/backup-restore.mjs <backup.json> <salonId> [--as <novoId>] [--yes]');
  process.exit(1);
}
if (target && !/^[a-z0-9][a-z0-9-]{1,62}$/.test(target)) {
  console.error('✗ --as tem de ser um slug válido (minúsculas, números e hífenes)');
  process.exit(1);
}

const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
const original = dump.salons.find(s => s.id === salonId);
if (!original) throw new Error(`salão ${salonId} não está neste backup`);
const dest = target || salonId;
// A copy belongs to nobody. A restore in place is the salon coming back as it
// was, owner included — nothing to strip there.
const salon = target ? neutraliseOwnership(original) : original;
const counts = Object.fromEntries(Object.entries(salon.collections).map(([k, v]) => [k, v.length]));
const expected = 1 + Object.values(counts).reduce((a, b) => a + b, 0);

console.log(`\n${apply ? 'A restaurar' : 'SIMULAÇÃO'}: “${salon.name}” (${salonId}) → salons/${dest}`);
console.log(`  backup de ${(dump.exportedAt || '').slice(0, 16).replace('T', ' ')} · ${expected} documentos`);
console.log(`  ${Object.entries(counts).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' ')}`);
if (target) {
  const stripped = Object.keys(salon.restoredOwnership || {});
  const staffOff = (salon.collections.staffAuth || []).length;
  console.log(`  cópia sem dono: ${stripped.length ? stripped.join(', ') + ' anulados' : 'não havia campos de posse'}`
    + `${staffOff ? `, ${staffOff} staffAuth inativos` : ''} · originais em restoredOwnership`);
  console.log(`  ⚠  ensaio apenas — ninguém consegue entrar nesta cópia; apaga-a no fim`);
}
if (dest === salonId && apply) console.log(`  ⚠  escreve POR CIMA do salão vivo — usa --as para ensaiar primeiro`);
if (!apply) { console.log('\nNada foi escrito. Junta --yes para avançar.\n'); process.exit(0); }

/* Belt and braces: the transform is unit-tested, but this looks at the actual
   bytes about to be written. A field named like an owner that nobody has seen
   before stops the restore here instead of surfacing as a panel showing the
   wrong salon. */
if (target) {
  const live = activeOwnershipIn(salon);
  if (live.length) {
    console.error('✗ a cópia ainda tem associações a utilizadores — nada foi escrito:');
    for (const l of live) console.error('   · ' + l);
    process.exit(1);
  }
}

const token = await ownerToken();
const strip = ({ id, path, collections, ...fields }) => fields;
const write = (docPath, fields) => api('PATCH', `${FS}/${docPath}`, token, { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) });

await write(`salons/${dest}`, { ...strip(salon), ...(target ? { slug: dest, restoredFrom: salonId, restoredAt: new Date().toISOString() } : {}) });
let n = 1;
for (const [col, docs] of Object.entries(salon.collections)) {
  for (const d of docs) { await write(`salons/${dest}/${col}/${d.id}`, strip(d)); n++; }
}

/* ── verify: what landed must match what we meant to write ──────────────── */
let back = 1;
const missing = [];
for (const [col, docs] of Object.entries(salon.collections)) {
  if (!docs.length) continue;
  const live = await listAll(token, `salons/${dest}/${col}`);
  back += live.length;
  if (live.length !== docs.length) missing.push(`${col}: escrevi ${docs.length}, encontrei ${live.length}`);
}
console.log(`\n✓ ${n} documentos escritos em salons/${dest}`);
if (missing.length) {
  console.error('✗ verificação falhou:');
  for (const m of missing) console.error('   · ' + m);
  process.exit(1);
}
console.log(`✓ verificado: ${back} documentos estão lá, tudo bate certo\n`);
