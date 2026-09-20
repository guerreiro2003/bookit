/* Permanently remove a salon tenant and everything under it.
 *
 * This is the most destructive tool in the repo, so it is built to be hard to
 * use by accident: it shows you exactly what it would destroy and does nothing
 * at all unless you pass --yes, and it refuses to run without a recent backup.
 *
 *   node scripts/delete-salon.mjs <salonId> [<salonId>…]          # dry run
 *   node scripts/delete-salon.mjs <salonId> [<salonId>…] --yes    # do it
 *
 * Options:
 *   --yes            actually delete (otherwise it only reports)
 *   --skip-backup    run without a fresh backup (you had better mean it)
 *
 * Runs with the Firebase CLI owner token, which BYPASSES security rules — the
 * salon document itself has `allow delete: if false`, so there is deliberately
 * no way to do this from the app.
 *
 * Auth accounts are NOT touched: the salon's admin and team users stay in
 * Firebase Auth. Remove those by hand in the console if you want them gone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ownerToken, listAll, getDocument, deleteDocument, FS, api } from './_lib.mjs';

const SUBS = ['config', 'users', 'services', 'staff', 'promotions', 'site_gallery', 'site_partners',
              'referrals', 'reactivations', 'bookingLinks', 'agenda', 'clients', 'bookings'];

const args = process.argv.slice(2);
const apply = args.includes('--yes');
const skipBackup = args.includes('--skip-backup');
const ids = args.filter(a => !a.startsWith('--'));

if (!ids.length) {
  console.error('usage: node scripts/delete-salon.mjs <salonId> [<salonId>…] [--yes] [--skip-backup]');
  process.exit(1);
}

/* ── a backup must exist, and be from today ─────────────────────────────── */
if (apply && !skipBackup) {
  const dir = 'backups';
  const today = new Date().toISOString().slice(0, 10);
  const fresh = fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.startsWith(`bookit-${today}`));
  if (!fresh) {
    console.error(`\n✗ Sem backup de hoje em ${path.resolve(dir)}.\n  Corre primeiro:  npm run backup\n  (ou --skip-backup, se souberes mesmo o que estás a fazer)\n`);
    process.exit(1);
  }
}

const token = await ownerToken();

/* ── show what is at stake ──────────────────────────────────────────────── */
const plan = [];
for (const id of ids) {
  const salon = await getDocument(token, `salons/${id}`);
  if (!salon) { console.log(`\n⚠  ${id} — não existe, ignorado.`); continue; }
  const counts = {};
  let total = 0;
  for (const c of SUBS) {
    const docs = await listAll(token, `salons/${id}/${c}`);
    if (docs.length) { counts[c] = docs.length; total += docs.length; }
  }
  plan.push({ id, salon, counts, total });
}

console.log(`\n${apply ? '🔥 A APAGAR' : '👀 SIMULAÇÃO (nada será apagado)'}\n`);
for (const p of plan) {
  console.log(`── ${p.id}  “${p.salon.name || '—'}”`);
  console.log(`   admin: ${p.salon.adminEmail || '—'} · plano: ${p.salon.plan || '—'} · criado: ${(p.salon.createdAt || '').slice(0, 10)}`);
  console.log(`   ${p.total} documentos: ${Object.entries(p.counts).map(([k, v]) => `${k}=${v}`).join(' ') || '(vazio)'}`);
  if (p.counts.bookings || p.counts.clients) {
    console.log(`   ⚠  contém dados de clientes reais — ${p.counts.clients || 0} fichas, ${p.counts.bookings || 0} marcações`);
  }
}

if (!apply) {
  console.log(`\nNada foi apagado. Para avançar mesmo:\n  npm run backup && node scripts/delete-salon.mjs ${ids.join(' ')} --yes\n`);
  process.exit(0);
}

/* ── delete: children first, salon document last ────────────────────────── */
console.log('');
for (const p of plan) {
  let gone = 0;
  for (const c of SUBS) {
    const docs = await listAll(token, `salons/${p.id}/${c}`);
    for (const d of docs) {
      await deleteDocument(token, `salons/${p.id}/${c}/${d.id}`);
      gone++;
    }
    // config can hold nested documents (config/schedule and friends)
    if (c === 'config') {
      for (const d of docs) {
        for (const sub of ['days']) {
          const nested = await listAll(token, `salons/${p.id}/config/${d.id}/${sub}`).catch(() => []);
          for (const n of nested) { await deleteDocument(token, `salons/${p.id}/config/${d.id}/${sub}/${n.id}`); gone++; }
        }
      }
    }
  }
  await deleteDocument(token, `salons/${p.id}`);
  console.log(`✓ ${p.id} apagado (${gone} documentos + o salão)`);
}

/* ── verify: nothing may survive ────────────────────────────────────────── */
console.log('\n— verificação —');
let leftovers = 0;
for (const p of plan) {
  const still = await getDocument(token, `salons/${p.id}`);
  if (still) { console.log(`✗ ${p.id} AINDA EXISTE`); leftovers++; continue; }
  let orphans = 0;
  for (const c of SUBS) orphans += (await listAll(token, `salons/${p.id}/${c}`).catch(() => [])).length;
  if (orphans) { console.log(`✗ ${p.id} apagado mas com ${orphans} documento(s) órfão(s)`); leftovers++; }
  else console.log(`✓ ${p.id} não deixou rasto`);
}

const remaining = (await api('GET', `${FS}/salons?pageSize=300`, token)).documents || [];
console.log(`\nSalões que restam (${remaining.length}): ${remaining.map(d => d.name.split('/').pop()).join(', ')}\n`);
process.exit(leftovers ? 1 : 0);
