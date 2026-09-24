/* The command line of backup-restore.mjs.
 *
 * KI-017: `restore <ficheiro> <salão>` — the plain recovery, the one the
 * disaster plan tells you to type — threw the backup file away and printed the
 * usage. It had never worked, and nothing noticed, because the only path
 * anybody had exercised was the rehearsal with --as.
 *
 * So every combination is written down here, including the ones that must be
 * refused. Parsing arguments is not interesting code; being wrong about which
 * salon gets overwritten is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRestoreArgs, USAGE } from '../scripts/restore-args.mjs';

const ok = (argv) => {
  const r = parseRestoreArgs(argv);
  assert.equal(r.ok, true, `esperava aceitar ${JSON.stringify(argv)}, deu: ${r.error}`);
  return r;
};
const rejected = (argv) => {
  const r = parseRestoreArgs(argv);
  assert.equal(r.ok, false, `esperava recusar ${JSON.stringify(argv)}`);
  return r.error;
};

test('no flags: a dry run over the salon itself', () => {
  // The regression. This exact call used to print the usage and exit 1.
  const r = ok(['backups/b.json', 'demo']);
  assert.equal(r.file, 'backups/b.json', 'o ficheiro era o argumento que se perdia');
  assert.equal(r.salonId, 'demo');
  assert.equal(r.target, null);
  assert.equal(r.apply, false, 'sem --yes nada é escrito');
});

test('--yes alone: restore in place, for real', () => {
  const r = ok(['backups/b.json', 'demo', '--yes']);
  assert.deepEqual([r.file, r.salonId, r.target, r.apply], ['backups/b.json', 'demo', null, true]);
});

test('--as X: a rehearsal, still a dry run', () => {
  const r = ok(['backups/b.json', 'demo', '--as', 'ensaio-01']);
  assert.deepEqual([r.file, r.salonId, r.target, r.apply], ['backups/b.json', 'demo', 'ensaio-01', false]);
});

test('--as X --yes: the rehearsal actually writes', () => {
  const r = ok(['backups/b.json', 'demo', '--as', 'ensaio-01', '--yes']);
  assert.deepEqual([r.file, r.salonId, r.target, r.apply], ['backups/b.json', 'demo', 'ensaio-01', true]);
});

test('--yes before --as reads the same', () => {
  const r = ok(['backups/b.json', 'demo', '--yes', '--as', 'ensaio-01']);
  assert.deepEqual([r.file, r.salonId, r.target, r.apply], ['backups/b.json', 'demo', 'ensaio-01', true]);
});

test('flags before the positionals, and in between, read the same', () => {
  assert.deepEqual(ok(['--yes', 'backups/b.json', 'demo']), { ok: true, file: 'backups/b.json', salonId: 'demo', target: null, apply: true });
  assert.deepEqual(ok(['backups/b.json', '--as', 'ensaio', 'demo']), { ok: true, file: 'backups/b.json', salonId: 'demo', target: 'ensaio', apply: false });
});

test('a path that looks like a flag is still not a flag', () => {
  // The old filter keyed on position, so where a flag sat changed which
  // positional was dropped. This one keys on the value.
  const r = ok(['./backups/-estranho.json', 'demo']);
  assert.equal(r.file, './backups/-estranho.json');
});

test('--as with no id is refused', () => {
  assert.match(rejected(['b.json', 'demo', '--as']), /--as precisa de um id novo/);
  // Without this, target would be '--yes' and the restore would land in a
  // salon called "--yes" — while apply stayed false, so nobody would see why.
  assert.match(rejected(['b.json', 'demo', '--as', '--yes']), /--as precisa de um id novo/);
});

test('a missing file or salonId prints the usage, unchanged', () => {
  assert.equal(rejected([]), USAGE);
  assert.equal(rejected(['b.json']), USAGE);
  assert.equal(rejected(['--yes']), USAGE);
  assert.equal(rejected(['b.json', '--as', 'x']), USAGE, 'o --as não substitui o salonId');
  assert.match(USAGE, /^usage: node scripts\/backup-restore\.mjs/, 'a mensagem antiga, à letra');
});

test('an unknown flag stops the script instead of being ignored', () => {
  // The decision, and the reason: --As mistyped leaves target null, dest falls
  // back to the ORIGINAL salon id, and --yes then writes a rehearsal over the
  // live salon. Ignoring unknown flags makes a typo silently destructive.
  assert.match(rejected(['b.json', 'demo', '--As', 'ensaio']), /flag desconhecida: --As/);
  assert.match(rejected(['b.json', 'demo', '--yess']), /flag desconhecida: --yess/);
  assert.match(rejected(['b.json', 'demo', '--force']), /flag desconhecida: --force/);
  assert.match(rejected(['b.json', 'demo', '--As', 'ensaio']), /usage:/, 'e mostra como se escreve');
});

test('an invalid --as slug keeps its own message', () => {
  const msg = rejected(['b.json', 'demo', '--as', 'Ensaio_01']);
  assert.equal(msg, '✗ --as tem de ser um slug válido (minúsculas, números e hífenes)');
  assert.match(rejected(['b.json', 'demo', '--as', 'x']), /slug válido/, 'um caractere é curto de mais');
  assert.match(rejected(['b.json', 'demo', '--as', '-comeca-com-hifen']), /slug válido/);
  assert.equal(ok(['b.json', 'demo', '--as', 'ensaio-2026-09-24']).target, 'ensaio-2026-09-24');
});

test('--as repeated is ambiguous, so it is refused', () => {
  assert.match(rejected(['b.json', 'demo', '--as', 'a', '--as', 'b']), /--as repetido/);
});

test('extra positionals are refused rather than ignored', () => {
  // Usually a shell glob that matched more than one backup.
  assert.match(rejected(['b.json', 'demo', 'outro.json']), /argumentos a mais: outro\.json/);
});

test('--yes twice is still just --yes', () => {
  assert.equal(ok(['b.json', 'demo', '--yes', '--yes']).apply, true);
});

test('nothing in the result is inherited from the argv array', () => {
  const argv = ['b.json', 'demo', '--as', 'ensaio'];
  const before = [...argv];
  parseRestoreArgs(argv);
  assert.deepEqual(argv, before, 'o argv do chamador não é modificado');
});
