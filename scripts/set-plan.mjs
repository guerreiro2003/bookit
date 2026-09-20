/* Operator-only: set a salon's subscription state. Bypasses security rules
 * (uses the Firebase CLI owner login), because the app itself must never be
 * able to change billing fields.
 *
 *   node scripts/set-plan.mjs <salonId> active
 *   node scripts/set-plan.mjs <salonId> trial 30        # 30-day trial from now
 *   node scripts/set-plan.mjs <salonId> suspended       # blocks new bookings
 */
import { ownerToken, patchDocument, getDocument } from './_lib.mjs';

const [salonId, plan, daysArg] = process.argv.slice(2);
if (!salonId || !['active', 'trial', 'suspended'].includes(plan)) {
  console.error('usage: node scripts/set-plan.mjs <salonId> <active|trial|suspended> [trialDays]'); process.exit(1);
}
const token = await ownerToken();
const salon = await getDocument(token, `salons/${salonId}`);
if (!salon) throw new Error('salon not found');
// `plan` and `trialEndsAt` stay on the salon document because the security
// rules read them on every booking. The rest of the commercial relationship
// goes to `private/billing`, which the public cannot read.
const fields = { plan };
if (plan === 'trial') fields.trialEndsAt = new Date(Date.now() + (Number(daysArg) || 30) * 86400000);
await patchDocument(token, `salons/${salonId}`, fields);
await patchDocument(token, `salons/${salonId}/private/billing`, { subscriptionStatus: plan, planUpdatedAt: new Date() });
console.log(`✓ ${salon.name} (${salonId}) → plan=${plan}${fields.trialEndsAt ? ' until ' + fields.trialEndsAt.toISOString() : ''}`);
