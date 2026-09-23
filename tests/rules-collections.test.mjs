/* TENANT_COLLECTIONS against firestore.rules — two lists that must agree.
 *
 * KI-014 happened because three copies of "what a salon owns" drifted apart and
 * nothing compared them. One list fixes the drift between the scripts; it does
 * not fix the original problem, which is that a collection gets added to the
 * app and nobody updates anything. Only a check against an independent source
 * catches that, and the rules are the independent source: a collection with no
 * rule is a collection nobody can read or write.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TENANT_COLLECTIONS } from '../scripts/_lib.mjs';
import { matchPaths, salonSubcollections, stripCommentsAndStrings } from './_rules-paths.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

/* A collection may be on the list without appearing in the rules only with a
   reason written here. Backups and deletes are operator jobs and run with a
   token that bypasses rules, so a collection that only ever exists server-side
   is legitimate — it just has to be a decision, not an oversight. */
const NOT_IN_RULES = {
  // (empty: every collection a salon owns is reachable from the app today)
};

/* Sub-collections the rules expose through a `{document=**}` wildcard. The
   exporter walks ONE level, so anything stored below `config/x/…` would be
   backed up as far as `config/x` and no further. Freezing the set here means a
   new wildcard has to be looked at rather than inherited. */
const RECURSIVE_WILDCARDS = ['config', 'private'];

test('every sub-collection in the rules is in TENANT_COLLECTIONS', () => {
  const { collections } = salonSubcollections(RULES);
  assert.ok(collections.length >= 15, `parsed only ${collections.length} collections — the parser, not the rules, is probably wrong`);
  const unlisted = collections.filter(c => !TENANT_COLLECTIONS.includes(c));
  assert.deepEqual(unlisted, [],
    `firestore.rules define ${unlisted.join(', ')} e a lista não os conhece: o backup não os exporta e o delete-salon deixa-os órfãos`);
});

test('every collection on the list exists in the rules, or is an explicit exception', () => {
  const { collections } = salonSubcollections(RULES);
  const orphans = TENANT_COLLECTIONS.filter(c => !collections.includes(c) && !(c in NOT_IN_RULES));
  assert.deepEqual(orphans, [],
    `${orphans.join(', ')} está na lista mas não tem regra — ou a regra desapareceu, ou a coleção já não existe`);
});

test('the rules declare no second-level sub-collection', () => {
  // backup-export.mjs does `salons/{id}/{collection}` and stops. A rule for
  // salons/{id}/clients/{id}/notes would be data the backup silently omits, so
  // this fails loudly and the exporter has to learn to recurse first.
  const { nested } = salonSubcollections(RULES);
  assert.deepEqual(nested, [],
    `subcoleções de segundo nível nas regras (${nested.map(n => `${n.collection} em ${n.path}`).join('; ')}) `
    + '— o export atual não as percorre e um restauro perdia-as');
});

test('no new {document=**} wildcard has appeared', () => {
  const { recursiveWildcards } = salonSubcollections(RULES);
  assert.deepEqual(recursiveWildcards.slice().sort(), RECURSIVE_WILDCARDS.slice().sort(),
    'um wildcard recursivo permite documentos a qualquer profundidade e o export só desce um nível');
});

test('TENANT_COLLECTIONS has no duplicates and no blanks', () => {
  assert.equal(new Set(TENANT_COLLECTIONS).size, TENANT_COLLECTIONS.length);
  assert.ok(TENANT_COLLECTIONS.every(c => typeof c === 'string' && c.trim() === c && c.length));
});

/* ── the parser itself, on sources where the answer is known ─────────────── */

test('nesting is resolved, not assumed from indentation', () => {
  const src = `
    match /databases/{db}/documents {
    match /salons/{salonId} {
        allow read: if true;
      match /clients/{clientId} {
            allow read: if true;
        match /notes/{noteId} { allow read: if false; }
      }
    }
    }`;
  const { collections, nested } = salonSubcollections(src);
  assert.deepEqual(collections, ['clients']);
  assert.deepEqual(nested.map(n => n.collection), ['notes'], 'a nested block is a second level even when it is indented flat');
});

test('a flat path is read the same as a nested one', () => {
  const src = `match /databases/{db}/documents {
      match /salons/{salonId}/clients/{clientId}/notes/{noteId} { allow read: if false; }
    }`;
  const { collections, nested } = salonSubcollections(src);
  assert.deepEqual(collections, ['clients']);
  assert.deepEqual(nested.map(n => n.collection), ['notes']);
});

test('braces inside strings do not shift the depth', () => {
  // The real rules are full of these: '^\\d{4}-(0[1-9]|1[0-2])' and friends.
  const src = `match /databases/{db}/documents {
      match /salons/{salonId} {
        allow read: if v.matches('^\\\\d{4}-\\\\d{2}') && w == "}{ } {";
        match /agenda/{id} { allow read: if true; }
      }
      match /outra/{id} { allow read: if true; }
    }`;
  const { collections, nested } = salonSubcollections(src);
  assert.deepEqual(collections, ['agenda'], 'agenda is inside the salon; `outra` is not');
  assert.deepEqual(nested, []);
});

test('comments are not read as rules', () => {
  const src = `match /databases/{db}/documents {
      match /salons/{salonId} {
        // match /inventado/{id} {
        /* match /tambem-inventado/{id} { um bloco { desequilibrado */
        match /staff/{id} { allow read: if true; }
      }
    }`;
  assert.deepEqual(salonSubcollections(src).collections, ['staff']);
});

test('stripping keeps the line numbers, so failures point somewhere real', () => {
  const src = "a\n// b\n'c\nd'\ne";
  assert.equal(stripCommentsAndStrings(src).split('\n').length, src.split('\n').length);
  const withComment = "match /databases/{db}/documents {\n// nada\nmatch /salons/{s} {\nmatch /x/{i} { }\n}\n}";
  assert.equal(matchPaths(withComment).find(p => p.path.endsWith('/x/{i}')).line, 4);
});
