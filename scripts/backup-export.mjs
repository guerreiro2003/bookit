/* Operator-only logical backup: dumps every salon and all sub-collections to a
 * timestamped JSON file. Complements (does not replace) Firestore's managed
 * backups / PITR — see DISASTER_RECOVERY.md.
 *
 *   node scripts/backup-export.mjs [outDir] [salonId]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ownerToken, listAll } from './_lib.mjs';

const [outDirArg, onlySalon] = process.argv.slice(2);
const outDir = outDirArg || 'backups';
const SUBS = ['config', 'users', 'services', 'staff', 'promotions', 'site_gallery', 'site_partners', 'referrals', 'agenda', 'clients', 'bookings'];

const token = await ownerToken();
const salons = (await listAll(token, 'salons')).filter(s => !onlySalon || s.id === onlySalon);
const dump = { exportedAt: new Date().toISOString(), salons: [] };
for (const s of salons) {
  const entry = { ...s, collections: {} };
  for (const c of SUBS) entry.collections[c] = await listAll(token, `salons/${s.id}/${c}`);
  dump.salons.push(entry);
  console.log(`✓ ${s.id}: ${SUBS.map(c => `${c}=${entry.collections[c].length}`).join(' ')}`);
}
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `bookit-${new Date().toISOString().replace(/[:.]/g, '-')}${onlySalon ? '-' + onlySalon : ''}.json`);
fs.writeFileSync(file, JSON.stringify(dump, null, 2));
console.log('→', file, `(${Math.round(fs.statSync(file).size / 1024)} KB)`);
