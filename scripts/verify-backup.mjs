/* Is this file actually a usable backup?
 *
 *   node scripts/verify-backup.mjs backups/bookit-….json
 *
 * A backup nobody has opened is a guess, not a safety net. This runs in CI on
 * every backup, right after it is written, so the day we need one we already
 * know it opens. It checks the shape and the content — an empty export is a
 * successful-looking failure, and that is the one that bites.
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/verify-backup.mjs <ficheiro.json>'); process.exit(1); }
if (!fs.existsSync(file)) { console.error('✗ ficheiro não encontrado:', file); process.exit(1); }

let dump;
try { dump = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.error('✗ não é JSON válido:', e.message); process.exit(1); }

const problems = [];
if (!dump.exportedAt) problems.push('sem data de exportação');
if (!Array.isArray(dump.salons) || !dump.salons.length) problems.push('sem salões — um export vazio parece ter corrido bem e não serve para nada');

let docs = 0, withData = 0;
for (const s of dump.salons || []) {
  if (!s.id) { problems.push('um salão sem id'); continue; }
  if (!s.collections) { problems.push(`${s.id}: sem subcoleções`); continue; }
  const n = Object.values(s.collections).reduce((a, c) => a + (Array.isArray(c) ? c.length : 0), 0);
  docs += n;
  if ((s.collections.clients?.length || 0) + (s.collections.bookings?.length || 0) > 0) withData++;
  // A salon with no services cannot take a booking — a sign of a partial read.
  if (!s.collections.services?.length) problems.push(`${s.id}: sem serviços (leitura incompleta?)`);
}

if (!withData) problems.push('nenhum salão tem clientes ou marcações — nada que valha a pena restaurar');

const size = Math.round(fs.statSync(file).size / 1024);
if (problems.length) {
  console.error(`✗ backup problemático (${size} KB):`);
  for (const p of problems) console.error(`   · ${p}`);
  process.exit(1);
}
console.log(`✓ backup íntegro — ${dump.salons.length} salão(ões), ${docs} documentos, ${size} KB, de ${dump.exportedAt.slice(0, 16).replace('T', ' ')}`);
