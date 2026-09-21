/* What has been going wrong in people's browsers.
 *
 *   node scripts/errors.mjs [salonId] [--all] [--clear]
 *
 * The salon says "às vezes não dá" and there is nothing to look at. This is the
 * something to look at: distinct errors from signed-in salon sessions, newest
 * first, with how many times each one happened and what the person was doing.
 *
 * Errors from the public booking page are NOT here — recording those would mean
 * a write path anyone could fill. Those need Sentry (see SENTRY_DSN in app.js).
 */
import { ownerToken, listAll, deleteDocument } from './_lib.mjs';

const args = process.argv.slice(2);
const all = args.includes('--all');
const clear = args.includes('--clear');
const only = args.find(a => !a.startsWith('--'));

const token = await ownerToken();
const salons = (await listAll(token, 'salons')).filter(s => !only || s.id === only);
if (!salons.length) { console.error('✗ salão não encontrado:', only); process.exit(1); }

let found = 0;
for (const s of salons) {
  const rows = (await listAll(token, `salons/${s.id}/_errors`))
    .sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
  if (!rows.length) { console.log(`\n── ${s.id}: sem erros registados`); continue; }
  found += rows.length;

  console.log(`\n── ${s.id} · ${rows.length} erro(s) distinto(s)\n`);
  for (const r of (all ? rows : rows.slice(0, 15))) {
    const when = String(r.lastAt || '').slice(0, 16).replace('T', ' ');
    const n = r.count || 1;
    console.log(`  ${String(n).padStart(4)}×  ${r.code}${r.where ? ` · ${r.where}` : ''}${r.page ? ` · ${r.page}` : ''}`);
    if (r.message) console.log(`        ${r.message}`);
    console.log(`        último: ${when}`);
    if (Array.isArray(r.trail) && r.trail.length) {
      console.log(`        antes: ${r.trail.map(t => t.what).join(' → ')}`);
    }
    console.log('');
  }
  if (!all && rows.length > 15) console.log(`  … mais ${rows.length - 15}. Junta --all.\n`);

  if (clear) {
    for (const r of rows) await deleteDocument(token, `salons/${s.id}/_errors/${r.id}`);
    console.log(`  ✓ ${rows.length} apagado(s).\n`);
  }
}

if (!found) console.log('\nNada a reportar — o que, neste caso, é bom sinal.\n');
