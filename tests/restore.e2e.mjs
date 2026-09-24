/* The destructive scripts, against the emulator — backup, restore, delete.
 *
 *   node --import ./tests/_register.mjs tests/restore.e2e.mjs
 *
 * These three paths had never run against a database. `backup-restore --yes`
 * in particular is what someone will type on the worst morning of the year,
 * and until now the only thing that had ever exercised it was a dry run.
 *
 * The comparison is the point. The restore used to verify itself by counting
 * documents per collection, and equal counts were called a match — which is
 * how a restore that returned every field with the wrong TYPE printed "tudo
 * bate certo" (see tests/value-roundtrip.test.mjs for what that cost). Here
 * every document is compared field by field through the lossless encoder, so
 * a timestamp that comes back as a string is a difference.
 *
 * Runs last in test:emul: part (c) deletes a salon on purpose.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TENANT_COLLECTIONS, IS_EMULATOR, targetSummary,
  ownerToken, listAllDump, getDocumentDump, api, FS,
} from '../scripts/_lib.mjs';

if (!IS_EMULATOR) {
  console.error(`\n✗ esta suite só corre contra o emulador — alvo atual: ${targetSummary()}\n`);
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${d}`); } };

const token = await ownerToken();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bookit-restore-'));

/** Run one of the operator scripts the way a person would. */
function script(args, { expectOk = true } = {}) {
  const r = spawnSync('node', args, { encoding: 'utf8', env: process.env });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (expectOk && r.status !== 0) {
    console.log(out);
    throw new Error(`${args.join(' ')} saiu com ${r.status}`);
  }
  return { status: r.status, out };
}

/** Every document of a salon, keyed by path, with types intact. */
async function snapshot(salonId) {
  const out = {};
  const s = await getDocumentDump(token, `salons/${salonId}`);
  if (s) out['(salão)'] = s;
  for (const c of TENANT_COLLECTIONS) {
    for (const d of await listAllDump(token, `salons/${salonId}/${c}`)) out[`${c}/${d.id}`] = d;
  }
  return out;
}

/** Differences between two snapshots, field by field and type by type. */
function diff(a, b, { ignore = [] } = {}) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changes = [];
  for (const k of keys) {
    if (!(k in a)) { changes.push(`${k}: apareceu`); continue; }
    if (!(k in b)) { changes.push(`${k}: desapareceu`); continue; }
    const fields = [...new Set([...Object.keys(a[k]), ...Object.keys(b[k])])]
      .filter(f => !ignore.includes(f) && JSON.stringify(a[k][f]) !== JSON.stringify(b[k][f]));
    for (const f of fields) {
      changes.push(`${k}.${f}: ${JSON.stringify(a[k][f])} → ${JSON.stringify(b[k][f])}`);
    }
  }
  return changes;
}

const show = (changes, n = 6) => changes.slice(0, n).join('; ') + (changes.length > n ? ` … (+${changes.length - n})` : '');

console.log(`\nRestore E2E — ${targetSummary()}\n`);

/* ══ (a) restore in place ════════════════════════════════════════════════ */
console.log('(a) RESTAURO NO LUGAR');
const before = await snapshot('demo');
ok('o salão demo tem documentos para salvar', Object.keys(before).length > 10, `(${Object.keys(before).length})`);

script(['scripts/backup-export.mjs', tmp, 'demo']);
const file = path.join(tmp, fs.readdirSync(tmp).filter(f => f.endsWith('.json')).sort().pop());
ok('o backup foi escrito', fs.existsSync(file));
const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
ok('e diz em que formato está', dump.format === 2, `(format=${JSON.stringify(dump.format)})`);
ok('e de onde veio', dump.source?.target === 'emulator');

script(['scripts/verify-backup.mjs', file]);
ok('o verificador aceita-o', true);

/* break things on purpose */
const { deleteDocument, patchDocument } = await import('../scripts/_lib.mjs');
await deleteDocument(token, 'salons/demo/bookings/b-demo-1');
await patchDocument(token, 'salons/demo/services/corte', { name: 'NOME ERRADO' });
await deleteDocument(token, 'salons/demo/clients/c-marta');
const broken = await snapshot('demo');
ok('estragado de propósito: 2 documentos a menos e 1 campo trocado',
  Object.keys(broken).length === Object.keys(before).length - 2, `(${Object.keys(broken).length})`);

script(['scripts/backup-restore.mjs', file, 'demo', '--yes']);
const after = await snapshot('demo');
const back = diff(before, after);
ok('o salão voltou ao estado do backup, documento a documento e com os tipos',
  back.length === 0, show(back));

/* The anchor. Everything above compares one snapshot with another, and both
   are taken through dumpValue — so a flaw in dumpValue itself is invisible to
   them: the ruler and the thing being measured bend together. (Tried it: with
   the old lossy encoder restored, the document-by-document comparison still
   said "idêntico".) So this last check goes around the encoder entirely and
   reads what Firestore actually holds. */
const raw = await api('GET', `${FS}/salons/demo/bookings/b-demo-2`, token);
ok('lido em cru da API: createdAt é um timestamp, não texto',
  'timestampValue' in (raw.fields?.createdAt || {}),
  `(${JSON.stringify(raw.fields?.createdAt)})`);
const rawSalon = await api('GET', `${FS}/salons/demo`, token);
ok('e o createdAt do próprio salão também',
  'timestampValue' in (rawSalon.fields?.createdAt || {}),
  `(${JSON.stringify(rawSalon.fields?.createdAt)})`);

let rawTs = 0;
for (const c of ['bookings', 'clients', 'staffAuth', 'private']) {
  for (const d of (await api('GET', `${FS}/salons/demo/${c}?pageSize=300`, token)).documents || []) {
    rawTs += Object.values(d.fields || {}).filter(v => 'timestampValue' in v).length;
  }
}
ok('e no total continuam lá os instantes que o backup levou', rawTs >= 8, `(${rawTs} campos timestamp)`);

/* ══ (b) rehearsal copy ══════════════════════════════════════════════════ */
console.log('\n(b) CÓPIA DE ENSAIO COM --as');
const COPY = 'ensaio-restauro';
script(['scripts/backup-restore.mjs', file, 'demo', '--as', COPY, '--yes']);

const copy = await snapshot(COPY);
ok('a cópia existe', !!copy['(salão)']);
ok('com os mesmos documentos', Object.keys(copy).length === Object.keys(before).length, `(${Object.keys(copy).length})`);

const { activeOwnershipIn } = await import('../scripts/restore-ownership.mjs');
const copyEntry = { id: COPY, ...copy['(salão)'], collections: { staffAuth: [], users: [] } };
for (const k of Object.keys(copy)) {
  if (k.startsWith('staffAuth/')) copyEntry.collections.staffAuth.push(copy[k]);
  if (k.startsWith('users/')) copyEntry.collections.users.push(copy[k]);
}
const live = activeOwnershipIn(copyEntry);
ok('e sem uma única associação a um utilizador ativa', live.length === 0, live.join('; '));
ok('os originais ficaram guardados', !!copy['(salão)'].restoredOwnership);
ok('e diz de onde foi restaurada', copy['(salão)'].restoredFrom === 'demo');

const untouched = diff(before, await snapshot('demo'));
ok('o salão original ficou intocado pela cópia', untouched.length === 0, show(untouched));

/* ══ (c) complete deletion ═══════════════════════════════════════════════ */
console.log('\n(c) APAGAMENTO COMPLETO (o que o RGPD exige)');
const zenBefore = await snapshot('zen-organic');
const demoBefore = await snapshot('demo');
ok('o zen-organic tem dados antes de apagar', Object.keys(zenBefore).length > 5, `(${Object.keys(zenBefore).length} documentos)`);

script(['scripts/delete-salon.mjs', 'zen-organic', '--yes', '--skip-backup']);

const zenAfter = await snapshot('zen-organic');
ok('o documento do salão desapareceu', !zenAfter['(salão)']);
const leftovers = [];
for (const c of TENANT_COLLECTIONS) {
  const n = (await listAllDump(token, `salons/zen-organic/${c}`)).length;
  if (n) leftovers.push(`${c}=${n}`);
}
ok(`todas as ${TENANT_COLLECTIONS.length} coleções de TENANT_COLLECTIONS ficaram vazias`,
  leftovers.length === 0, leftovers.join(' '));

const demoAfter = await snapshot('demo');
const collateral = diff(demoBefore, demoAfter);
ok('e o demo ficou intocado', collateral.length === 0, show(collateral));
console.log(`     zen-organic: ${Object.keys(zenBefore).length} → ${Object.keys(zenAfter).length} documentos`);
console.log(`     demo:        ${Object.keys(demoBefore).length} → ${Object.keys(demoAfter).length} documentos`);

/* ── cleanup: the rehearsal copy is not meant to outlive the rehearsal ── */
script(['scripts/delete-salon.mjs', COPY, '--yes', '--skip-backup']);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
