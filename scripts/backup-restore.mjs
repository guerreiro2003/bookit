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
import { ownerToken, api, listAllDump, getDocumentDump, FS, loadValue, targetSummary } from './_lib.mjs';
import { neutraliseOwnership, activeOwnershipIn } from './restore-ownership.mjs';
import { parseRestoreArgs } from './restore-args.mjs';
import { crossTargetProblem } from './verify-backup-core.mjs';

const parsed = parseRestoreArgs(process.argv.slice(2));
if (!parsed.ok) { console.error(parsed.error); process.exit(1); }
const { file, salonId, target, apply } = parsed;

const dump = JSON.parse(fs.readFileSync(file, 'utf8'));

/* Before anything reaches the network, and before the dry run even prints a
   plan: a backup taken from the emulator has the same shape and the same salon
   ids as a real one, and restoring it over a live salon would replace a
   salon's history with invented people. */
const crossed = crossTargetProblem(dump);
if (crossed) {
  console.error(`\n✗ ${crossed}`);
  console.error(`  alvo atual: ${targetSummary()}`);
  console.error('  Para restaurar um backup do emulador, corre dentro do emulador com BOOKIT_TARGET=emulator.\n');
  process.exit(1);
}

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
const stripRead = (d) => (d ? strip(d) : null);
const write = (docPath, fields) => api('PATCH', `${FS}/${docPath}`, token, { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, loadValue(v)])) });

const stamp = { slug: dest, restoredFrom: salonId, restoredAt: { $ts: new Date().toISOString() } };
await write(`salons/${dest}`, { ...strip(salon), ...(target ? stamp : {}) });
let n = 1;
for (const [col, docs] of Object.entries(salon.collections)) {
  for (const d of docs) { await write(`salons/${dest}/${col}/${d.id}`, strip(d)); n++; }
}

/* ── verify: read it all back and compare the CONTENT ────────────────────
   This used to count documents per collection and call equal counts a match.
   It was right about the counts and blind to everything else: a restore that
   returned every field with the wrong type printed "tudo bate certo". So now
   each document is re-read and compared field by field, through the same
   lossless encoder the backup uses — which means a timestamp that comes back
   as a string is a difference, not a coincidence of printing. */
const problems = [];
const compare = (where, expected, actual) => {
  if (actual === null) { problems.push(`${where}: não está lá`); return; }
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
    .filter(k => k !== 'id' && k !== 'path');
  const diff = keys.filter(k => JSON.stringify(expected[k]) !== JSON.stringify(actual[k]));
  if (diff.length) {
    problems.push(`${where}: ${diff.length} campo(s) diferentes — ${diff.slice(0, 6).join(', ')}`
      + (diff.length > 6 ? ` …` : '')
      + `\n       esperado ${JSON.stringify(expected[diff[0]])}, encontrado ${JSON.stringify(actual[diff[0]])}`);
  }
};

let back = 0;
compare(`salons/${dest}`, strip({ ...salon, ...(target ? stamp : {}) }), stripRead(await getDocumentDump(token, `salons/${dest}`)));
back++;
for (const [col, docs] of Object.entries(salon.collections)) {
  if (!docs.length) continue;
  const live = await listAllDump(token, `salons/${dest}/${col}`);
  const byId = new Map(live.map(d => [d.id, d]));
  if (live.length !== docs.length) problems.push(`${col}: escrevi ${docs.length}, encontrei ${live.length}`);
  for (const d of docs) { compare(`${col}/${d.id}`, strip(d), stripRead(byId.get(d.id) || null)); back++; }
}

console.log(`\n✓ ${n} documentos escritos em salons/${dest}`);
if (problems.length) {
  console.error(`✗ verificação falhou — o que foi lido de volta não é o que estava no backup:`);
  for (const p of problems.slice(0, 20)) console.error('   · ' + p);
  if (problems.length > 20) console.error(`   … e mais ${problems.length - 20}`);
  process.exit(1);
}
console.log(`✓ verificado: ${back} documentos, campo a campo e com os tipos certos\n`);
