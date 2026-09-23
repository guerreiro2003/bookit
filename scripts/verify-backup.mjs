/* Is this file actually a usable backup?
 *
 *   node scripts/verify-backup.mjs backups/bookit-….json
 *
 * A backup nobody has opened is a guess, not a safety net. This runs in CI on
 * every backup, right after it is written, so the day we need one we already
 * know it opens. It checks the shape and the content — an empty export is a
 * successful-looking failure, and that is the one that bites.
 *
 * The decisions live in verify-backup-core.mjs, where they can be tested
 * against deliberately broken fixtures (tests/verify-backup.test.mjs). This
 * file only reads, prints and sets the exit code.
 */
import fs from 'node:fs';
import { checkBackup, countDocuments } from './verify-backup-core.mjs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/verify-backup.mjs <ficheiro.json>'); process.exit(1); }
if (!fs.existsSync(file)) { console.error('✗ ficheiro não encontrado:', file); process.exit(1); }

let dump;
try { dump = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.error('✗ não é JSON válido:', e.message); process.exit(1); }

const problems = checkBackup(dump);
const docs = countDocuments(dump);

const size = Math.round(fs.statSync(file).size / 1024);
if (problems.length) {
  console.error(`✗ backup problemático (${size} KB):`);
  for (const p of problems) console.error(`   · ${p}`);
  process.exit(1);
}
console.log(`✓ backup íntegro — ${dump.salons.length} salão(ões), ${docs} documentos, ${size} KB, de ${dump.exportedAt.slice(0, 16).replace('T', ' ')}`);
