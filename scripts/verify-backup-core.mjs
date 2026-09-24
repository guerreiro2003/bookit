/* What makes a backup usable — the judgement, with no file system attached.
 *
 * This lives apart from scripts/verify-backup.mjs so it can be tested against
 * fixtures instead of against whatever happens to be in backups/. A verifier
 * that has only ever run on good files is itself unverified: the interesting
 * question is whether it says NO to the broken ones, and that question needs
 * broken files that nobody has to produce by hand.
 *
 * The CLI keeps the I/O (read the file, parse it, print, exit code). Everything
 * below decides, and decides only from the value it is given.
 */
import { TENANT_COLLECTIONS, TARGET } from './_lib.mjs';

/**
 * Where a backup came from.
 *
 * A file with no stamp is production. Until 2026-09-24 there was nowhere else
 * to take a backup from, so "unstamped" and "real" mean the same thing — and
 * guessing the other way would quietly wave through every old file.
 *
 * @returns {{target: 'real'|'emulator', project: string|null, stamped: boolean}}
 */
export function backupSource(dump) {
  const s = dump?.source;
  if (!s || typeof s !== 'object') return { target: 'real', project: null, stamped: false };
  return {
    target: s.target === 'emulator' ? 'emulator' : 'real',
    project: typeof s.project === 'string' ? s.project : null,
    stamped: true,
  };
}

/**
 * Is this backup from somewhere it must not be used?
 *
 * One direction only: a backup taken from the emulator must never be used
 * against the real project. It carries invented people with the same salon
 * ids, the same shape and the same "✓" as the real thing — restoring one over
 * a live salon would replace a salon's history with fiction.
 *
 * The other direction stays open on purpose: restoring INTO the emulator is
 * the whole point of a rehearsal, and T7 needs to restore an emulator backup
 * inside the emulator.
 *
 * @returns {string|null} the problem, phrased for the operator, or null
 */
export function crossTargetProblem(dump, target = TARGET) {
  const src = backupSource(dump);
  if (src.target === 'emulator' && target !== 'emulator') {
    return `este backup foi tirado do EMULADOR${src.project ? ` (projeto ${src.project})` : ''}`
      + ' e o alvo atual é o projeto real — são dados inventados, não servem para restaurar nada';
  }
  return null;
}

/**
 * Everything wrong with this backup, in the order a reader should hear it.
 * An empty array means the file is restorable.
 *
 * @param {object} dump parsed backup JSON
 * @param {{collections?: string[], target?: 'real'|'emulator'}} [opts]
 *        `collections` overrides the list the export is measured against and
 *        `target` where it is being read — the tests use both, the CLI neither.
 * @returns {string[]} problems, already phrased for the operator
 */
export function checkBackup(dump, { collections = TENANT_COLLECTIONS, target = TARGET } = {}) {
  const problems = [];
  if (!dump || typeof dump !== 'object' || Array.isArray(dump)) {
    return ['não é um objeto de backup'];
  }

  // First, because it makes every other answer beside the point: a file from
  // somewhere else is not a backup of this, however well-formed it is.
  const crossed = crossTargetProblem(dump, target);
  if (crossed) problems.push(crossed);

  if (!dump.exportedAt) problems.push('sem data de exportação');
  if (!Array.isArray(dump.salons) || !dump.salons.length) {
    problems.push('sem salões — um export vazio parece ter corrido bem e não serve para nada');
  }

  /* Completeness. This is the check that was missing: an export that skipped a
     whole collection still printed "✓" for everything it did read, so nothing
     ever looked wrong. A backup must say which collections it walked, and that
     list must cover every collection a salon owns. */
  if (!Array.isArray(dump.collections)) {
    problems.push('não declara que coleções exportou — formato antigo, anterior a 2026-09-21. '
      + 'Esses exports não incluem staffAuth nem waitlist: um restauro deixaria a equipa sem acesso');
  } else {
    const missing = collections.filter(c => !dump.collections.includes(c));
    if (missing.length) problems.push(`coleções em falta no export: ${missing.join(', ')} — o restauro ficaria incompleto`);
  }

  let withData = 0;
  for (const s of dump.salons || []) {
    if (!s || !s.id) { problems.push('um salão sem id'); continue; }
    if (!s.collections) { problems.push(`${s.id}: sem subcoleções`); continue; }
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

  return problems;
}

/** How many documents the backup holds, for the line printed on success. */
export function countDocuments(dump) {
  let docs = 0;
  for (const s of dump?.salons || []) {
    if (!s?.collections) continue;
    docs += Object.values(s.collections).reduce((a, c) => a + (Array.isArray(c) ? c.length : 0), 0);
  }
  return docs;
}
