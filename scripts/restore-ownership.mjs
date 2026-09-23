/* Who a restored copy belongs to — and why the answer must be "nobody".
 *
 * `backup-restore.mjs --as <id>` writes a second copy of a salon beside the
 * real one. Until now the copy came back with the owner's uid still on it, and
 * that is not a cosmetic detail: admin.html and account.html find the salon a
 * person administers with
 *
 *     getDocs(query(collection(db,'salons'), where('adminUid','==', uid)))
 *
 * and then take `snap.docs[0]` (admin.html:1112, account.html:317). Two salons
 * match, the first one wins, and "first" means lowest document id — so a
 * rehearsal copy called `aaa-teste` quietly becomes the panel the owner sees
 * when they sign in. They would be editing the copy and wondering why the real
 * salon never changes.
 *
 * So `--as` strips every association between a person and this salon:
 *
 *   salons/{id}.adminUid   owner. Drives the query above and isAdmin() in the
 *                          rules, which gates writes to every sub-collection.
 *   salons/{id}.teamUid    legacy shared team login — isTeam() in the rules,
 *   salons/{id}.teamEmail  role 'team' in resolveActor(), the gate staff.html
 *                          checks before showing the password form.
 *   staffAuth/{uid}.active one document per employee, keyed by their own uid;
 *                          isMember() reads exactly this flag. Set to false,
 *                          the document is kept — a restore rehearsal exists to
 *                          prove staffAuth comes back, so deleting it would
 *                          erase the thing being tested (see KI-014).
 *   users/{uid}.role       written by setup.html as `role: 'admin'`. No rule
 *                          reads it today; it is neutralised anyway, because a
 *                          dormant "this uid is an admin here" record on an
 *                          unowned copy is a trap for whoever writes the next
 *                          rule.
 *
 * The originals go to `restoredOwnership`, so a copy can still be read for what
 * it was and an operator can put them back deliberately.
 *
 * What this does NOT neutralise: `clients/{id}.uid` / `.email` and
 * `bookings.clientId` / `.clientEmail`, which let a client read their own row
 * (ownsClientDoc / ownsBooking). Those are the data the rehearsal is there to
 * check, and blanking them would leave nothing to verify. A copy is therefore
 * still readable by the clients in it, and — since `allow read: if true` on
 * salons/{salonId} covers list as well as get — still publicly listable.
 * Delete the copy when the rehearsal ends. See the header of backup-restore.mjs.
 */

/** Salon-document fields that tie a uid to this salon. */
export const SALON_OWNER_FIELDS = ['adminUid', 'teamUid', 'teamEmail'];

const hasValue = (v) => v !== undefined && v !== null && v !== '';

/**
 * A copy of `salon` that nobody administers, works at, or owns.
 * Pure: the backup entry it is given is never modified.
 *
 * @param {object} salon one entry of dump.salons — `{id, …fields, collections}`
 * @returns {object} the same shape, de-owned, with `restoredOwnership` holding
 *          whatever was taken away
 */
export function neutraliseOwnership(salon) {
  const out = { ...salon };
  const kept = {};

  for (const f of SALON_OWNER_FIELDS) {
    if (hasValue(salon?.[f])) kept[f] = salon[f];
    // null, not delete: a missing field makes `salon(id).adminUid` raise inside
    // the rules instead of simply comparing unequal, and an equality against
    // null is the one outcome that is false for every possible uid.
    if (f in out || hasValue(salon?.[f])) out[f] = null;
  }

  const collections = { ...(salon?.collections || {}) };

  if (Array.isArray(collections.staffAuth)) {
    collections.staffAuth = collections.staffAuth.map((d) => {
      const wasActive = d?.active ?? true;          // rules default: get('active', true)
      return { ...d, active: false, restoredOwnership: { active: wasActive } };
    });
  }

  if (Array.isArray(collections.users)) {
    collections.users = collections.users.map((d) => (
      hasValue(d?.role) ? { ...d, role: null, restoredOwnership: { role: d.role } } : { ...d }
    ));
  }

  if (salon?.collections) out.collections = collections;
  if (Object.keys(kept).length) out.restoredOwnership = { ...(salon.restoredOwnership || {}), ...kept };
  return out;
}

/**
 * Every association still live on a salon entry, as readable strings.
 *
 * The restore calls this after transforming and refuses to write if it returns
 * anything — the test proves the transform is right today, this proves it on
 * the data actually in front of us, including fields nobody has thought of yet
 * that happen to be named like an owner.
 *
 * @returns {string[]} empty when the copy belongs to nobody
 */
export function activeOwnershipIn(salon) {
  const live = [];
  for (const f of SALON_OWNER_FIELDS) {
    if (hasValue(salon?.[f])) live.push(`salons/${salon.id}.${f}=${salon[f]}`);
  }
  // Anything else on the salon document whose name looks like an identity.
  for (const [k, v] of Object.entries(salon || {})) {
    if (k === 'restoredOwnership' || SALON_OWNER_FIELDS.includes(k)) continue;
    if (/(^|[a-z])(Uid|UserId)$/.test(k) && hasValue(v)) live.push(`salons/${salon.id}.${k}=${v}`);
  }
  for (const d of salon?.collections?.staffAuth || []) {
    if ((d?.active ?? true) !== false) live.push(`staffAuth/${d.id} ainda ativo`);
  }
  for (const d of salon?.collections?.users || []) {
    if (hasValue(d?.role)) live.push(`users/${d.id}.role=${d.role}`);
  }
  return live;
}
