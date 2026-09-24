/* Operator-only logical backup: dumps every salon and all sub-collections to a
 * timestamped JSON file. Complements (does not replace) Firestore's managed
 * backups / PITR — see DISASTER_RECOVERY.md.
 *
 *   node scripts/backup-export.mjs [outDir] [salonId]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ownerToken, listAllDump, TENANT_COLLECTIONS, TARGET, PROJECT, targetSummary, BACKUP_FORMAT } from './_lib.mjs';

const [outDirArg, onlySalon] = process.argv.slice(2);
const outDir = outDirArg || 'backups';
const SUBS = TENANT_COLLECTIONS;

console.log(`Backup ← ${targetSummary()}`);
const token = await ownerToken();
const salons = (await listAllDump(token, 'salons')).filter(s => !onlySalon || s.id === onlySalon);
// `collections` records what this export WALKED, not just what it found. Without
// it a backup cannot be told apart from one that silently skipped a collection.
//
// `source` records WHERE it came from. Since the emulator exists, a backup file
// is no longer self-evidently production: an export from a seeded emulator has
// the same shape, the same salon ids and the same "✓" as the real thing, and
// restoring one over a live salon would replace real data with invented people.
// The verifier and the restore both read this and refuse the crossing.
//
// `format` says how the values inside are encoded. Format 1 wrote every value
// through the ergonomic decoder, which turned timestamps into strings — a
// restore from one of those gives back the right values with the wrong types,
// and a salon on a trial plan then fails planActive() in the rules and refuses
// every online booking. Format 2 is lossless; the verifier rejects format 1.
const dump = {
  exportedAt: new Date().toISOString(),
  format: BACKUP_FORMAT,
  source: { target: TARGET, project: PROJECT },
  collections: SUBS,
  salons: [],
};
for (const s of salons) {
  const entry = { ...s, collections: {} };
  for (const c of SUBS) entry.collections[c] = await listAllDump(token, `salons/${s.id}/${c}`);
  dump.salons.push(entry);
  const shown = SUBS.filter(c => entry.collections[c].length);
  console.log(`✓ ${s.id}: ${shown.map(c => `${c}=${entry.collections[c].length}`).join(' ') || '(vazio)'}`);
}
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `bookit-${new Date().toISOString().replace(/[:.]/g, '-')}${onlySalon ? '-' + onlySalon : ''}.json`);
fs.writeFileSync(file, JSON.stringify(dump, null, 2));
console.log('→', file, `(${Math.round(fs.statSync(file).size / 1024)} KB)`);
