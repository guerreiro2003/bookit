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
import { checkBackup, countDocuments } from '../scripts/verify-backup-core.mjs';
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

test('the document count is what the CLI prints on success', () => {
  assert.equal(countDocuments(dump()), 5, 'services + staff + staffAuth + clients + bookings');
  assert.equal(countDocuments({ salons: [] }), 0);
  assert.equal(countDocuments(null), 0);
  assert.equal(countDocuments({ salons: [{ id: 'x', collections: { a: 'não é lista' } }] }), 0);
});
