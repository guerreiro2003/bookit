/* A rehearsal copy must belong to nobody.
 *
 * `--as` writes a second salon with the same owner uid on it, and admin.html
 * picks the salon to show with a query on adminUid followed by `docs[0]`. The
 * copy is therefore not inert: it competes with the real salon for the owner's
 * own panel, and whichever document id sorts first wins.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neutraliseOwnership, activeOwnershipIn, SALON_OWNER_FIELDS } from '../scripts/restore-ownership.mjs';

const OWNER = 'uid-dono';
const TEAM = 'uid-equipa';

const backupEntry = (over = {}) => ({
  id: 'demo',
  name: 'Zen Organic',
  adminUid: OWNER,
  teamUid: TEAM,
  teamEmail: 'equipa@exemplo.pt',
  plan: 'active',
  primaryColor: '#112233',
  ...over,
  collections: {
    staffAuth: [
      { id: 'uid-ana', staffId: 'ana', name: 'Ana', active: true },
      { id: 'uid-rui', staffId: 'rui', name: 'Rui' },              // no flag: rules read it as active
      { id: 'uid-zoe', staffId: 'zoe', name: 'Zoé', active: false },
    ],
    users: [{ id: OWNER, email: 'dono@exemplo.pt', role: 'admin' }],
    services: [{ id: 'corte', name: 'Corte' }],
    clients: [{ id: 'c1', name: 'Rita', uid: 'uid-rita', email: 'rita@exemplo.pt' }],
    ...(over.collections || {}),
  },
});

test('the copy carries no active association with any user', () => {
  const copy = neutraliseOwnership(backupEntry());
  assert.deepEqual(activeOwnershipIn(copy), [], 'nothing left that ties a person to this salon');

  for (const f of SALON_OWNER_FIELDS) assert.equal(copy[f], null, `${f} must be null`);
  // Not undefined: a missing field makes the rules' isAdmin() raise rather than
  // compare, and null is the one value no uid can equal.
  for (const f of SALON_OWNER_FIELDS) assert.ok(f in copy, `${f} must still be present, as null`);

  assert.deepEqual(copy.collections.staffAuth.map(d => d.active), [false, false, false]);
  assert.equal(copy.collections.users[0].role, null);
});

test('the original values are kept, not thrown away', () => {
  const copy = neutraliseOwnership(backupEntry());
  assert.deepEqual(copy.restoredOwnership, {
    adminUid: OWNER, teamUid: TEAM, teamEmail: 'equipa@exemplo.pt',
  });
  assert.deepEqual(copy.collections.staffAuth.map(d => d.restoredOwnership.active), [true, true, false],
    'someone with no active flag counted as active, because that is what the rules do');
  assert.equal(copy.collections.users[0].restoredOwnership.role, 'admin');
});

test('the owner query cannot reach the copy', () => {
  // What admin.html:1112 / account.html:317 do: where('adminUid','==',uid).
  const real = backupEntry();
  const copy = neutraliseOwnership({ ...real, id: 'aaa-ensaio' });
  const matches = [real, copy].filter(s => s.adminUid === OWNER);
  assert.deepEqual(matches.map(s => s.id), ['demo'],
    'only the real salon answers; docs[0] on the copy was the whole bug');
});

test('everything that is not an association survives untouched', () => {
  const copy = neutraliseOwnership(backupEntry());
  assert.equal(copy.name, 'Zen Organic');
  assert.equal(copy.plan, 'active');
  assert.equal(copy.primaryColor, '#112233');
  // Document counts must not move: a rehearsal exists to prove the restore is
  // complete, so dropping staffAuth would erase the thing being verified.
  assert.equal(copy.collections.staffAuth.length, 3);
  assert.equal(copy.collections.services.length, 1);
  assert.deepEqual(copy.collections.services, [{ id: 'corte', name: 'Corte' }]);
  assert.deepEqual(copy.collections.staffAuth.map(d => d.name), ['Ana', 'Rui', 'Zoé']);
  assert.deepEqual(copy.collections.staffAuth.map(d => d.staffId), ['ana', 'rui', 'zoe']);
});

test('client rows are deliberately left alone, and the check says so', () => {
  // ownsClientDoc() lets a client read their own row by uid or verified email.
  // Blanking those would leave the rehearsal with nothing to verify, so the
  // copy stays readable by the clients in it — documented, not accidental.
  const copy = neutraliseOwnership(backupEntry());
  assert.equal(copy.collections.clients[0].uid, 'uid-rita');
  assert.deepEqual(activeOwnershipIn(copy), [], 'client rows are not salon-level associations');
});

test('the backup entry is never modified', () => {
  const source = backupEntry();
  const before = JSON.parse(JSON.stringify(source));
  neutraliseOwnership(source);
  assert.deepEqual(source, before, 'a restore in place reads the same object and must see the real owner');
});

test('a salon with nothing to strip comes back unharmed', () => {
  const bare = { id: 'x', name: 'X', collections: { services: [{ id: 's' }] } };
  const copy = neutraliseOwnership(bare);
  assert.deepEqual(activeOwnershipIn(copy), []);
  assert.equal(copy.restoredOwnership, undefined, 'nothing was taken, so nothing is recorded');
  assert.deepEqual(copy.collections.services, [{ id: 's' }]);
  assert.deepEqual(neutraliseOwnership({ id: 'y' }).collections, undefined);
});

test('activeOwnershipIn catches an association nobody has thought of', () => {
  // The transform can only strip fields it knows. This is the second line: any
  // field named like an identity, on a copy, stops the restore before it writes.
  const odd = neutraliseOwnership(backupEntry({ franchiseOwnerUid: 'uid-alguem' }));
  const live = activeOwnershipIn(odd);
  assert.equal(live.length, 1);
  assert.match(live[0], /franchiseOwnerUid=uid-alguem/);
});

test('an un-neutralised salon is reported field by field', () => {
  const live = activeOwnershipIn(backupEntry());
  assert.ok(live.some(l => l.includes('adminUid=' + OWNER)));
  assert.ok(live.some(l => l.includes('teamUid=' + TEAM)));
  assert.ok(live.some(l => l.includes('teamEmail=')));
  assert.ok(live.some(l => l.includes('staffAuth/uid-ana ainda ativo')));
  assert.ok(live.some(l => l.includes('staffAuth/uid-rui ainda ativo')), 'no flag means active');
  assert.ok(!live.some(l => l.includes('uid-zoe')), 'already inactive, nothing to report');
  assert.ok(live.some(l => l.includes(`users/${OWNER}.role=admin`)));
});
