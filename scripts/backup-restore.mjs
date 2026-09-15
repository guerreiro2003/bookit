/* Operator-only: restore one salon from a backup-export JSON file into the
 * project (same or a fresh one). Writes documents with their original IDs;
 * existing documents are overwritten. Bypasses security rules.
 *
 *   node scripts/backup-restore.mjs <backup.json> <salonId> [--yes]
 */
import fs from 'node:fs';
import { ownerToken, api, FS, toValue } from './_lib.mjs';

const [file, salonId, flag] = process.argv.slice(2);
if (!file || !salonId) { console.error('usage: node scripts/backup-restore.mjs <backup.json> <salonId> [--yes]'); process.exit(1); }
const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
const salon = dump.salons.find(s => s.id === salonId);
if (!salon) throw new Error(`salon ${salonId} not in backup`);
if (flag !== '--yes') { console.log(`Would restore "${salon.name}" (${salonId}) with`, Object.fromEntries(Object.entries(salon.collections).map(([k, v]) => [k, v.length])), '\nRe-run with --yes to write.'); process.exit(0); }

const token = await ownerToken();
const strip = ({ id, path, collections, ...fields }) => fields;
const write = (docPath, fields) => api('PATCH', `${FS}/${docPath}`, token, { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) });

await write(`salons/${salonId}`, strip(salon));
let n = 1;
for (const [col, docs] of Object.entries(salon.collections)) {
  for (const d of docs) { await write(`salons/${salonId}/${col}/${d.id}`, strip(d)); n++; }
}
console.log(`✓ restored ${n} documents into salons/${salonId}`);
