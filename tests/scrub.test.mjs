/* The error log must never become a second copy of the client database.
 * These run against the same regexes `reportError` uses before storing
 * anything, so a message that happens to carry a person's details arrives
 * without them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirrors the scrub() in app.js. Kept here as data, not imported, because the
// module needs a browser; if the two ever drift, these tests are the spec.
const scrub = (s) => String(s ?? '')
  .replace(/[\w.+-]+@[\w.-]+\.\w+/g, '‹email›')
  .replace(/(?<!\d)(?:(?:\+|00)?351[\s.-]?)?9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}(?!\d)/g, '‹telemóvel›')
  .slice(0, 300);

test('emails never survive', () => {
  assert.equal(scrub('falhou para maria.silva@exemplo.pt'), 'falhou para ‹email›');
  assert.equal(scrub('a@b.pt e c.d+x@sub.dominio.com'), '‹email› e ‹email›');
});

test('Portuguese mobile numbers never survive, in the shapes people write them', () => {
  for (const n of ['912345678', '912 345 678', '912-345-678', '912.345.678', '+351912345678', '351 912345678', '+351 912 345 678', '00351912345678']) {
    assert.equal(scrub(`ligar ${n} agora`), 'ligar ‹telemóvel› agora', `falhou para "${n}"`);
  }
});

test('the words around a number keep their spaces', () => {
  // A missing space here is how you notice the regex is eating the separator.
  assert.equal(scrub('com 912 345 678 falhou'), 'com ‹telemóvel› falhou');
  assert.equal(scrub('com +351 912 345 678 falhou'), 'com ‹telemóvel› falhou');
});

test('numbers that are not phones are left alone', () => {
  assert.equal(scrub('erro 500 ao gravar'), 'erro 500 ao gravar');
  assert.equal(scrub('demorou 1234 ms'), 'demorou 1234 ms');
  assert.equal(scrub('booking 8EUWHkumszOiTPPc1o6t'), 'booking 8EUWHkumszOiTPPc1o6t');
  assert.equal(scrub('id 1234567890123'), 'id 1234567890123', 'um id longo não é um telemóvel');
});

test('a long message is cut, so one error cannot carry a whole document', () => {
  assert.equal(scrub('x'.repeat(500)).length, 300);
});

test('empty and odd input never throws', () => {
  assert.equal(scrub(null), '');
  assert.equal(scrub(undefined), '');
  assert.equal(scrub(42), '42');
});
