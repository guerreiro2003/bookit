import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, sleep } from '../booking-core.js';

test('a promise that finishes in time passes its value through', async () => {
  assert.equal(await withTimeout(Promise.resolve('pronto'), 500), 'pronto');
  assert.equal(await withTimeout(sleep(10).then(() => 42), 500), 42);
});

test('a slow promise rejects with a timeout code', async () => {
  await assert.rejects(
    () => withTimeout(sleep(300), 50),
    (e) => e.code === 'timeout',
  );
});

test('the real error wins when it arrives before the deadline', async () => {
  // A booking refused by the rules must report THAT, not "too slow" — the two
  // call for opposite things from the person waiting.
  await assert.rejects(
    () => withTimeout(Promise.reject(Object.assign(new Error('x'), { code: 'slot-taken' })), 500),
    (e) => e.code === 'slot-taken',
  );
});

test('the underlying promise is not cancelled — a sent write cannot be recalled', async () => {
  // This is the whole reason the caller has to go and look afterwards.
  let finished = false;
  const slow = sleep(120).then(() => { finished = true; return 'chegou'; });
  await assert.rejects(() => withTimeout(slow, 20), (e) => e.code === 'timeout');
  assert.equal(finished, false, 'ainda não tinha acabado quando desistimos');
  assert.equal(await slow, 'chegou');
  assert.equal(finished, true, 'acabou à mesma — por isso é preciso ir confirmar');
});

test('the timer does not keep the process alive after settling', async () => {
  // A leaked timer per booking attempt would pin a phone browser awake.
  const before = process.getActiveResourcesInfo?.().filter(r => r === 'Timeout').length ?? 0;
  await withTimeout(Promise.resolve(1), 10_000);
  const after = process.getActiveResourcesInfo?.().filter(r => r === 'Timeout').length ?? 0;
  assert.ok(after <= before, `timers ficaram pendurados: ${before} → ${after}`);
});
