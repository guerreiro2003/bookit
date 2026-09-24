/* The projectId rewrite that keeps the SDK suites on the emulator's database.
 *
 * The Firestore emulator keeps a separate database per project id, and
 * connectFirestoreEmulator() changes the host but not the project. firebase.js
 * hard-codes `projectId: "bookit-51575"` and must keep doing so — it is what
 * ships to the browser. So the loader rewrites it as the file is read.
 *
 * What is tested here is the part that can go wrong silently: if firebase.js
 * ever changes shape, the rewrite must fail loudly rather than leave every SDK
 * suite reading an empty database and passing for the wrong reason.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteProjectId } from './_node-firebase-loader.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REAL = fs.readFileSync(path.join(ROOT, 'firebase.js'), 'utf8');

test('the real firebase.js still has exactly one projectId', () => {
  // The whole mechanism rests on this. If it stops being true, this test is
  // the warning — not a suite that mysteriously reads nothing.
  const out = rewriteProjectId(REAL, 'demo-bookit');
  assert.match(out, /projectId: "demo-bookit"/);
  assert.equal(out.includes('bookit-51575'), true, 'other references to the project are left alone');
  assert.equal((out.match(/projectId:/g) || []).length, 1);
});

test('nothing but the projectId moves', () => {
  const out = rewriteProjectId(REAL, 'demo-bookit');
  assert.equal(out.split('\n').length, REAL.split('\n').length, 'same number of lines');
  const diff = out.split('\n').filter((l, i) => l !== REAL.split('\n')[i]);
  assert.equal(diff.length, 1, `exactly one line changes, got ${diff.length}`);
  assert.match(diff[0], /projectId/);
});

test('a copy with no projectId is refused', () => {
  const copy = REAL.replace(/projectId:\s*["'][^"']+["'],?/, '');
  assert.throws(() => rewriteProjectId(copy, 'demo-bookit'), /encontrei 0/);
});

test('a copy with two projectIds is refused', () => {
  const copy = REAL.replace('projectId: "bookit-51575"', 'projectId: "bookit-51575",\n  projectId: "outro"');
  assert.throws(() => rewriteProjectId(copy, 'demo-bookit'), /encontrei 2/);
});

test('the error says what to do, not just what happened', () => {
  try {
    rewriteProjectId('const c = {};', 'demo-bookit');
    assert.fail('should have thrown');
  } catch (e) {
    assert.match(e.message, /O firebase\.js mudou de forma/);
    assert.match(e.message, /base de dados vazia/, 'says what the silent failure would look like');
  }
});

test('single quotes and loose spacing are still found', () => {
  assert.match(rewriteProjectId("{ projectId:'x-1' }", 'demo-bookit'), /projectId: "demo-bookit"/);
  assert.match(rewriteProjectId('{ projectId:   "x-1" }', 'demo-bookit'), /projectId: "demo-bookit"/);
});
