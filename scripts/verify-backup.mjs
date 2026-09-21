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
import { TENANT_COLLECTIONS } from './_lib.mjs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/verify-backup.mjs <ficheiro.json>'); process.exit(1); }
if (!fs.existsSync(file)) { console.error('✗ ficheiro não encontrado:', file); process.exit(1); }

let dump;
try { dump = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.error('✗ não é JSON válido:', e.message); process.exit(1); }

const problems = [];
if (!dump.exportedAt) problems.push('sem data de exportação');
if (!Array.isArray(dump.salons) || !dump.salons.length) problems.push('sem salões — um export vazio parece ter corrido bem e não serve para nada');

/* Completeness. This is the check that was missing: an export that skipped a
   whole collection still printed "✓" for everything it did read, so nothing
   ever looked wrong. A backup must say which collections it walked, and that
   list must cover every collection a salon owns. */
if (!Array.isArray(dump.collections)) {
  problems.push('não declara que coleções exportou — formato antigo, anterior a 2026-09-21. '
    + 'Esses exports não incluem staffAuth nem waitlist: um restauro deixaria a equipa sem acesso');
} else {
  const missing = TENANT_COLLECTIONS.filter(c => !dump.collections.includes(c));
  if (missing.length) problems.push(`coleções em falta no export: ${missing.join(', ')} — o restauro ficaria incompleto`);
}

let docs = 0, withData = 0;
for (const s of dump.salons || []) {
  if (!s.id) { problems.push('um salão sem id'); continue; }
  if (!s.collections) { problems.push(`${s.id}: sem subcoleções`); continue; }
  const n = Object.values(s.collections).reduce((a, c) => a + (Array.isArray(c) ? c.length : 0), 0);
  docs += n;
  if ((s.collections.clients?.length || 0) + (s.collections.bookings?.length || 0) > 0) withData++;
  // A salon with no services cannot take a booking — a sign of a partial read.
  if (!s.collections.services?.length) problems.push(`${s.id}: sem serviços (leitura incompleta?)`);
  // Whoever has their own login must come back with it. Without staffAuth the
  // salon restores with only the owner able to sign in, and nothing says so.
  if (Array.isArray(s.collections.staff) && s.collections.staff.some(x => x.uid) && !s.collections.staffAuth?.length) {
    problems.push(`${s.id}: há colaboradores com conta própria mas staffAuth veio vazio — restaurariam sem acesso`);
  }
}

if (!withData) problems.push('nenhum salão tem clientes ou marcações — nada que valha a pena restaurar');

const size = Math.round(fs.statSync(file).size / 1024);
if (problems.length) {
  console.error(`✗ backup problemático (${size} KB):`);
  for (const p of problems) console.error(`   · ${p}`);
  process.exit(1);
}
console.log(`✓ backup íntegro — ${dump.salons.length} salão(ões), ${docs} documentos, ${size} KB, de ${dump.exportedAt.slice(0, 16).replace('T', ' ')}`);
