/* The backup verifier, against backups that are deliberately broken.
 *
 * Every fixture here is synthetic. The point of a verifier is the NO: a check
 * that has only ever run on good files has never been shown to work. These are
 * the failures KI-014 was about, written down so they cannot come back quietly.
 *
 * Whether TENANT_COLLECTIONS itself is right is a different question, and it is
 * asked in rules-collections.test.mjs — here the list is taken as given.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBackup, countDocuments, backupSource, crossTargetProblem } from '../scripts/verify-backup-core.mjs';
import { TENANT_COLLECTIONS } from '../scripts/_lib.mjs';

/** A salon that would genuinely restore: services to sell, people, history. */
function salon(over = {}) {
  const collections = Object.fromEntries(TENANT_COLLECTIONS.map(c => [c, []]));
  Object.assign(collections, {
    services: [{ id: 'corte', name: 'Corte', price: 20 }],
    staff: [{ id: 'ana', name: 'Ana', uid: 'uid-ana' }],
    staffAuth: [{ id: 'uid-ana', staffId: 'ana', active: true }],
    clients: [{ id: 'c1', name: 'Rita' }],
    bookings: [{ id: 'b1', date: '2026-09-01' }],
  }, over.collections || {});
  return { id: 'demo', name: 'Demo', adminUid: 'uid-dono', ...over, collections };
}

/** A whole export around those salons. */
const dump = (over = {}) => ({
  exportedAt: '2026-09-22T10:00:00.000Z',
  collections: [...TENANT_COLLECTIONS],
  salons: [salon()],
  ...over,
});

const joined = (problems) => problems.join(' | ');

test('a complete backup is accepted', () => {
  assert.deepEqual(checkBackup(dump()), [], 'nothing to complain about');
});

test('the old format, with no collections list, is rejected', () => {
  // Exactly the files from 20 September: they read what they knew about and
  // never said what that was, so staffAuth and waitlist went missing in silence.
  const old = dump();
  delete old.collections;
  const problems = checkBackup(old);
  assert.equal(problems.length, 1);
  assert.match(joined(problems), /formato antigo/);
  assert.match(joined(problems), /staffAuth/, 'says what it is that would be lost');
});

test('an export that skipped a collection is rejected, and names it', () => {
  const partial = dump({ collections: TENANT_COLLECTIONS.filter(c => c !== 'staffAuth' && c !== 'waitlist') });
  const problems = checkBackup(partial);
  assert.equal(problems.length, 1);
  assert.match(joined(problems), /coleções em falta no export: staffAuth, waitlist/);
});

test('a collection declared but unknown to the list is not an error', () => {
  // The export walking something extra is not a broken backup. The other
  // direction — the list growing and the export not — is the failure.
  assert.deepEqual(checkBackup(dump({ collections: [...TENANT_COLLECTIONS, 'brindes'] })), []);
});

test('staff with their own login but an empty staffAuth is rejected', () => {
  // The restore would bring the salon back with the whole team locked out, and
  // the old verifier printed ✓ for it.
  const s = salon();
  s.collections.staffAuth = [];
  const problems = checkBackup(dump({ salons: [s] }));
  assert.equal(problems.length, 1);
  assert.match(joined(problems), /demo: há colaboradores com conta própria mas staffAuth veio vazio/);
});

test('staff without individual logins do not need staffAuth', () => {
  const s = salon();
  s.collections.staff = [{ id: 'ana', name: 'Ana' }];   // no uid: nobody has an account
  s.collections.staffAuth = [];
  assert.deepEqual(checkBackup(dump({ salons: [s] })), []);
});

test('an export with no salons is rejected', () => {
  const problems = checkBackup(dump({ salons: [] }));
  assert.match(joined(problems), /sem salões/);
  assert.match(joined(problems), /nada que valha a pena restaurar/);
  assert.deepEqual(checkBackup(dump({ salons: undefined })).length > 0, true, 'a missing key is not a pass either');
});

test('a salon with no services is flagged', () => {
  const s = salon();
  s.collections.services = [];
  const problems = checkBackup(dump({ salons: [s] }));
  assert.equal(problems.length, 1);
  assert.match(joined(problems), /demo: sem serviços \(leitura incompleta\?\)/);
});

test('a salon with no clients and no bookings is not worth restoring', () => {
  const s = salon();
  s.collections.clients = [];
  s.collections.bookings = [];
  assert.match(joined(checkBackup(dump({ salons: [s] }))), /nenhum salão tem clientes ou marcações/);
});

test('shapeless input is refused instead of throwing', () => {
  // The CLI hands over whatever JSON.parse returned. A crash here reads as a
  // broken verifier; a problem reads as a broken backup, which is the truth.
  for (const bad of [null, undefined, 42, 'texto', []]) {
    assert.ok(checkBackup(bad).length > 0, `${JSON.stringify(bad)} must be rejected`);
  }
  assert.deepEqual(checkBackup({}).length > 0, true);
  const noId = checkBackup(dump({ salons: [{ name: 'sem id' }] }));
  assert.match(joined(noId), /um salão sem id/);
  const noCols = checkBackup(dump({ salons: [{ id: 'x' }] }));
  assert.match(joined(noCols), /x: sem subcoleções/);
});

test('missing exportedAt is reported on its own', () => {
  const d = dump();
  delete d.exportedAt;
  assert.deepEqual(checkBackup(d), ['sem data de exportação']);
});

/* ── where the file came from ─────────────────────────────────────────────
   Since the emulator exists, a backup is no longer self-evidently production.
   A seeded emulator exports the same shape, the same salon ids and the same
   "✓" as the real thing — and the people in it are invented. */

const fromEmulator = (over = {}) => dump({ source: { target: 'emulator', project: 'demo-bookit' }, ...over });
const fromReal = (over = {}) => dump({ source: { target: 'real', project: 'bookit-51575' }, ...over });

test('a backup from the emulator is rejected when the target is the real project', () => {
  const problems = checkBackup(fromEmulator(), { target: 'real' });
  assert.equal(problems.length, 1, 'nothing else about this file is wrong');
  assert.match(problems[0], /tirado do EMULADOR \(projeto demo-bookit\)/);
  assert.match(problems[0], /dados inventados/, 'says why, not just that');
});

test('the same backup is accepted inside the emulator', () => {
  // The rehearsal has to be able to restore it (T7), so this direction stays open.
  assert.deepEqual(checkBackup(fromEmulator(), { target: 'emulator' }), []);
});

test('a backup with no stamp counts as production', () => {
  const old = dump();
  assert.equal('source' in old, false, 'the fixture really has no stamp');
  assert.deepEqual(backupSource(old), { target: 'real', project: null, stamped: false });
  assert.deepEqual(checkBackup(old, { target: 'real' }), [], 'every file from before 2026-09-24 is one of these');
});

test('a production backup is fine against the real project', () => {
  assert.deepEqual(checkBackup(fromReal(), { target: 'real' }), []);
  assert.deepEqual(backupSource(fromReal()), { target: 'real', project: 'bookit-51575', stamped: true });
});

test('a damaged or lying stamp is read as production, never as emulator', () => {
  // Reading an unreadable stamp as "emulator" would block a real restore in a
  // real emergency. Reading it as "real" only ever risks a refusal too few,
  // and the other checks are still there.
  for (const bad of [null, 'emulator', 42, [], { target: 'EMULATOR' }, { target: 'outra-coisa' }]) {
    assert.equal(backupSource({ source: bad }).target, 'real', `source=${JSON.stringify(bad)}`);
  }
  assert.equal(backupSource({ source: { target: 'emulator' } }).project, null, 'a stamp with no project still counts');
  assert.match(crossTargetProblem({ source: { target: 'emulator' } }, 'real'), /tirado do EMULADOR/);
});

test('crossTargetProblem is silent in every direction that is allowed', () => {
  assert.equal(crossTargetProblem(fromEmulator(), 'emulator'), null);
  assert.equal(crossTargetProblem(fromReal(), 'real'), null);
  assert.equal(crossTargetProblem(fromReal(), 'emulator'), null, 'production into the emulator is a rehearsal, not a mistake');
  assert.equal(crossTargetProblem(dump(), 'real'), null);
});

test('the crossing is reported even when the file is also broken', () => {
  // The refusal must not depend on the rest of the file being well-formed,
  // and it comes first because it makes every other answer beside the point.
  const bad = fromEmulator({ salons: [] });
  const problems = checkBackup(bad, { target: 'real' });
  assert.match(problems[0], /tirado do EMULADOR/);
  assert.ok(problems.length > 1, 'the other problems are still reported');
});

test('the document count is what the CLI prints on success', () => {
  assert.equal(countDocuments(dump()), 5, 'services + staff + staffAuth + clients + bookings');
  assert.equal(countDocuments({ salons: [] }), 0);
  assert.equal(countDocuments(null), 0);
  assert.equal(countDocuments({ salons: [{ id: 'x', collections: { a: 'não é lista' } }] }), 0);
});
