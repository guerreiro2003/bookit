/* A backup has to give back what it took — type included.
 *
 * It did not. `fromValue` turned a timestamp into a string and `toValue` wrote
 * that string back as a string, so every document came home with the right
 * values and the wrong types. Nothing caught it, because the restore verified
 * document COUNTS, and the counts were right.
 *
 * What it cost, concretely: firestore.rules line 45 reads
 * `request.time < s.trialEndsAt`. Comparing a timestamp with a string is a
 * type error in the rules, and an error denies — a salon on a trial plan would
 * be restored whole and then refuse every online booking, silently.
 *
 * So: dumpValue → loadValue, for every type Firestore has, through JSON.
 * Through JSON is the point. The pair being symmetric in memory proves
 * nothing; the value has to survive being written to a file and read back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dumpValue, loadValue } from '../scripts/_lib.mjs';

/** Firestore value → JSON text → Firestore value, the way a backup does it. */
const roundTrip = (v) => loadValue(JSON.parse(JSON.stringify(dumpValue(v))));

const survives = (label, value) => test(`survives a round trip: ${label}`, () => {
  assert.deepEqual(roundTrip(value), value);
});

survives('null', { nullValue: null });
survives('true', { booleanValue: true });
survives('false', { booleanValue: false });
survives('integer', { integerValue: '42' });
survives('negative integer', { integerValue: '-7' });
survives('zero', { integerValue: '0' });
survives('decimal', { doubleValue: 35.5 });
survives('negative decimal', { doubleValue: -0.125 });
survives('text', { stringValue: 'Corte + Brushing' });
survives('empty text', { stringValue: '' });
survives('timestamp', { timestampValue: '2026-09-24T10:45:41.755Z' });
survives('bytes', { bytesValue: 'aGVsbG8gd29ybGQ=' });
survives('reference', { referenceValue: 'projects/demo-bookit/databases/(default)/documents/salons/demo' });
survives('geopoint', { geoPointValue: { latitude: 38.7223, longitude: -9.1393 } });
survives('empty list', { arrayValue: { values: [] } });
survives('empty map', { mapValue: { fields: {} } });

test('a whole decimal stays a decimal — 35.0 is not 35', () => {
  // The one that looks like a rounding detail and is not: an integerValue and
  // a doubleValue are different types to Firestore and to the rules.
  assert.deepEqual(roundTrip({ doubleValue: 35 }), { doubleValue: 35 });
  assert.deepEqual(roundTrip({ integerValue: '35' }), { integerValue: '35' });
  assert.notDeepEqual(roundTrip({ doubleValue: 35 }), roundTrip({ integerValue: '35' }));
});

test('text shaped like a date stays text', () => {
  // The whole reason timestamps are tagged rather than guessed at by shape.
  const v = { stringValue: '2026-09-24T10:45:41.755Z' };
  assert.deepEqual(roundTrip(v), v);
  assert.notDeepEqual(roundTrip(v), roundTrip({ timestampValue: '2026-09-24T10:45:41.755Z' }));
  assert.equal(typeof dumpValue(v), 'string', 'and it is still plain text in the file');
});

test('an integer too big for a JS number keeps its digits', () => {
  const big = { integerValue: '9007199254740993' };   // 2^53 + 1
  assert.deepEqual(roundTrip(big), big);
  assert.equal(Number(big.integerValue).toString(), '9007199254740992', 'a plain number would have lost the last digit');
});

test('NaN and infinities survive, though JSON has no word for them', () => {
  for (const d of [NaN, Infinity, -Infinity]) {
    const out = roundTrip({ doubleValue: d });
    assert.equal(Number.isNaN(d) ? Number.isNaN(out.doubleValue) : out.doubleValue === d, true, String(d));
  }
});

test('nested lists and maps survive whole', () => {
  const v = {
    mapValue: {
      fields: {
        nome: { stringValue: 'Ana' },
        visitas: { integerValue: '3' },
        gasto: { doubleValue: 105.5 },
        desde: { timestampValue: '2026-02-10T09:00:00Z' },
        etiquetas: { arrayValue: { values: [{ stringValue: 'vip' }, { integerValue: '7' }] } },
        morada: { mapValue: { fields: { cidade: { stringValue: 'Lisboa' }, cp: { nullValue: null } } } },
      },
    },
  };
  assert.deepEqual(roundTrip(v), v);
});

test('a map with a key that looks like a tag is not mistaken for one', () => {
  // Someone's data containing a field literally called "$ts" must not be read
  // back as a timestamp.
  const v = { mapValue: { fields: { $ts: { stringValue: 'não sou uma data' } } } };
  assert.deepEqual(roundTrip(v), v);
  const nested = { mapValue: { fields: { $double: { integerValue: '1' }, outro: { booleanValue: true } } } };
  assert.deepEqual(roundTrip(nested), nested);
});

test('a list of timestamps keeps every one of them', () => {
  const v = { arrayValue: { values: [
    { timestampValue: '2026-01-01T00:00:00Z' },
    { stringValue: '2026-01-01T00:00:00Z' },
    { timestampValue: '2026-06-30T23:59:59Z' },
  ] } };
  assert.deepEqual(roundTrip(v), v);
});

test('dumpValue refuses a type it does not know rather than dropping it', () => {
  // A new Firestore type must stop the backup, not be silently written as null.
  assert.throws(() => dumpValue({ somethingNewValue: 1 }), /tipo desconhecido/);
});

test('the file a person opens is still readable', () => {
  // Tagging is only for what JSON cannot say. Ordinary data stays ordinary.
  assert.equal(dumpValue({ stringValue: 'Corte' }), 'Corte');
  assert.equal(dumpValue({ integerValue: '45' }), 45);
  assert.equal(dumpValue({ doubleValue: 35.5 }), 35.5);
  assert.equal(dumpValue({ booleanValue: true }), true);
  assert.equal(dumpValue({ nullValue: null }), null);
  assert.deepEqual(dumpValue({ mapValue: { fields: { a: { integerValue: '1' } } } }), { a: 1 });
});
