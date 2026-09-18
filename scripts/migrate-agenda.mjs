/* Migrate agenda documents from the flat `intervals[]` shape to `byBooking`.
 *
 *   node scripts/migrate-agenda.mjs <salonId> <adminEmail> <adminPassword> [--yes]
 *
 * Why: keying the agenda by booking lets the security rules require that a write
 * touches only its own booking. With a flat list, a caller could rewrite the
 * whole day as long as the element count matched.
 *
 * Idempotent: documents already migrated are skipped. Run without --yes for a
 * dry run.
 */
import { signIn, listAll, api, FS, toValue } from './_lib.mjs';

const [salonId, email, pw, flag] = process.argv.slice(2);
if (!salonId || !email || !pw) { console.error('usage: node scripts/migrate-agenda.mjs <salonId> <adminEmail> <adminPassword> [--yes]'); process.exit(1); }
const apply = flag === '--yes';

const { token } = await signIn(email, pw);
const docs = await listAll(token, `salons/${salonId}/agenda`);
let migrated = 0, skipped = 0, empty = 0;

for (const d of docs) {
  if (d.byBooking) { skipped++; continue; }
  const intervals = Array.isArray(d.intervals) ? d.intervals : [];
  const byBooking = {};
  for (const iv of intervals) {
    if (!iv?.bookingId || !Number.isFinite(iv.start) || !Number.isFinite(iv.end)) continue;
    if (!byBooking[iv.bookingId]) byBooking[iv.bookingId] = { blocks: [] };
    byBooking[iv.bookingId].blocks.push({ start: iv.start, end: iv.end });
  }
  if (!Object.keys(byBooking).length) { empty++; }
  console.log(`  ${apply ? '→' : '(dry)'} ${d.id}: ${intervals.length} intervalo(s) → ${Object.keys(byBooking).length} marcação(ões)`);
  if (!apply) continue;
  // Write the new shape and drop the legacy field in one patch.
  await api('PATCH', `${FS}/salons/${salonId}/agenda/${d.id}?updateMask.fieldPaths=byBooking&updateMask.fieldPaths=intervals&updateMask.fieldPaths=staffId&updateMask.fieldPaths=date`, token, {
    fields: { byBooking: toValue(byBooking), staffId: toValue(d.staffId), date: toValue(d.date) },
  });
  migrated++;
}
console.log(apply
  ? `\n✓ ${migrated} migrados · ${skipped} já no formato novo · ${empty} sem marcações`
  : `\n${docs.length} documentos analisados (${skipped} já migrados). Corre com --yes para aplicar.`);
