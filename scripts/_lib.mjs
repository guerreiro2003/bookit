/* Shared helpers for operator scripts (run with Node ≥ 20).
 *
 * Two auth modes:
 *  - ownerToken(): Google OAuth access token of the Firebase CLI login
 *    (`firebase login`). Requests with it BYPASS security rules — use only for
 *    operator tasks (billing, backups, migrations).
 *  - signIn(email, pw): Firebase Auth ID token — subject to security rules.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* ── Where these requests go ───────────────────────────────────────────────
 *
 * Two targets: the real project, and the local emulator suite.
 *
 * `BOOKIT_TARGET=real|emulator` decides, and it is the ONLY switch for that.
 * An unrecognised value throws instead of falling back, because a typo
 * (`emulador`, `1`, `true`) must never be read as "real" and send writes to a
 * live salon.
 *
 * The default depends on who is asking, deliberately:
 *   - operator scripts default to REAL — a backup has to back up what exists;
 *   - tests default to EMULATOR, so a suite run by hand or by CI cannot write
 *     to a live salon just because somebody forgot a variable.
 *
 * Consequence worth knowing before relying on a green suite: the suites stop
 * being a smoke test of production. Checking what is actually in the air means
 * `BOOKIT_TARGET=real`, and the emulator does not enforce composite indexes —
 * a query that passes there can still fail in production asking for one.
 */

/** Project id used in the emulator.
 *
 *  The `demo-` prefix is a Firebase convention: the tooling treats such a
 *  project as emulator-only, asks for no login, and there is nothing behind it
 *  if something is ever misconfigured — which is what lets CI run with no
 *  secrets at all.
 *
 *  Name collision, said out loud because it will trip somebody up:
 *  `demo-bookit` is a PROJECT that exists only inside the emulator; `demo` is
 *  a SALON — a tenant id — and it exists both there and in the real project.
 *  Different things at different levels: a project holds salons. When you read
 *  "demo" somewhere, check which of the two it is.
 */
export const EMULATOR_PROJECT = 'demo-bookit';

/**
 * @param {{defaultTarget?: 'real'|'emulator'}} [opts]
 * @returns {'real'|'emulator'}
 */
export function resolveTarget({ defaultTarget = 'real' } = {}) {
  const raw = (process.env.BOOKIT_TARGET || '').trim().toLowerCase();
  if (!raw) return defaultTarget;
  if (raw === 'real' || raw === 'emulator') return raw;
  throw new Error(`BOOKIT_TARGET inválido: "${process.env.BOOKIT_TARGET}" — usa "real" ou "emulator"`);
}

export const TARGET = resolveTarget();          // scripts: the real project
export const IS_EMULATOR = TARGET === 'emulator';

/* Where the emulator listens. The ports match the `emulators` block in
   firebase.json, and `firebase emulators:exec` exports both variables into the
   child process — so inside an exec these are already correct. They say WHERE
   the emulator is, never WHETHER to use it: that is BOOKIT_TARGET's job, and
   one switch is enough. */
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

export const PROJECT = process.env.FIREBASE_PROJECT || (IS_EMULATOR ? EMULATOR_PROJECT : 'bookit-51575');
// A deliberately fake key in emulator mode: the Auth emulator requires the
// parameter and ignores the value, and a fake key cannot authenticate against
// production if a host is ever misresolved.
export const API_KEY = process.env.FIREBASE_API_KEY
  || (IS_EMULATOR ? 'fake-api-key' : 'AIzaSyABK6W0yTe_EQfna5_Sz7DcI9nPwvh5TNw');
export const FS = IS_EMULATOR
  ? `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
/** Base URL of the Identity Toolkit for the current target. Exported because
 *  a suite that writes the production URL by hand creates real accounts even
 *  when everything else is pointed at the emulator — which is exactly what
 *  rules.integration.mjs was doing for its anonymous-auth section. */
export const IDENTITY = IS_EMULATOR
  ? `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`
  : 'https://identitytoolkit.googleapis.com/v1';

/** One line naming where this process is pointing, for a script or a suite to
 *  print before it does anything. "It ran green" is only worth something once
 *  you know what it ran against. */
export const targetSummary = () => (IS_EMULATOR
  ? `emulador · projeto ${PROJECT} · firestore ${FIRESTORE_HOST} · auth ${AUTH_HOST}`
  : `PROJETO REAL · ${PROJECT}`);

/**
 * Every sub-collection a salon owns.
 *
 * ONE list, deliberately. There used to be three — one in the exporter, one in
 * the deleter, one implied by the rules — and they drifted: `staffAuth` and
 * `waitlist` were added to the app and nobody added them here. The backups
 * kept saying "✓" while quietly leaving out the document that decides who on
 * the team can sign in. A restore from one of those would have brought the
 * salon back with every employee locked out.
 *
 * Adding a collection to firestore.rules means adding it here. The backup
 * verifier checks this list against what a backup declares, so the next time
 * they drift the backup fails instead of lying.
 */
export const TENANT_COLLECTIONS = [
  'config', 'private', 'staffAuth', 'users',
  'services', 'staff', 'promotions', 'site_gallery', 'site_partners',
  'referrals', 'reactivations', 'bookingLinks', 'waitlist',
  'agenda', 'clients', 'bookings', '_errors',
];

/** RS256 JWT → access token. Lets the backup run somewhere with no human
 *  logged in (CI, a cron box) using a service-account key. No dependencies:
 *  node:crypto signs it, which keeps this repo free of a runtime tree. */
async function serviceAccountToken(sa) {
  const { createSign } = await import('node:crypto');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const claim = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  });
  const sig = createSign('RSA-SHA256').update(claim).end().sign(sa.private_key).toString('base64url');
  const r = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${claim}.${sig}` }),
  })).json();
  if (!r.access_token) throw new Error('Service account token failed: ' + JSON.stringify(r));
  return r.access_token;
}

export async function ownerToken() {
  // The Firestore emulator accepts the literal bearer token "owner" as a
  // request that bypasses the rules. No login, no service-account key, no
  // secret of any kind — which is precisely what makes the suites runnable in
  // CI, on forks, and on a laptop with nobody signed in.
  if (IS_EMULATOR) return 'owner';
  // A service-account key wins when present — that is how CI authenticates.
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return serviceAccountToken(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON));
  }
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(cfgPath)) throw new Error('Firebase CLI not logged in. Run: firebase login');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const refresh = cfg.tokens?.refresh_token;
  if (!refresh) throw new Error('No refresh token in firebase-tools config. Run: firebase login');
  // Public OAuth client of firebase-tools (not a secret).
  const body = new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: refresh, grant_type: 'refresh_token',
  });
  const r = await (await fetch('https://www.googleapis.com/oauth2/v4/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })).json();
  if (!r.access_token) throw new Error('Token exchange failed: ' + JSON.stringify(r));
  return r.access_token;
}

export async function signIn(email, password) {
  const r = await (await fetch(`${IDENTITY}/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })).json();
  if (!r.idToken) throw new Error('Sign-in failed: ' + (r.error?.message || 'unknown'));
  return { token: r.idToken, uid: r.localId };
}

export async function signUp(email, password) {
  const r = await (await fetch(`${IDENTITY}/accounts:signUp?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })).json();
  if (!r.idToken) throw new Error('Sign-up failed: ' + (r.error?.message || 'unknown'));
  return { token: r.idToken, uid: r.localId };
}

/* ── Firestore REST value (de)serialisation ── */
export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
  throw new Error('Unsupported value: ' + typeof v);
}
export function fromValue(v) {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)]));
  return null;
}
export const fromDoc = (d) => ({ id: d.name.split('/').pop(), path: d.name.split('/documents/')[1], ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromValue(v)])) });

/* ── Lossless (de)serialisation, for backups ───────────────────────────────
 *
 * `fromValue` above is the ergonomic one: it hands a script a plain JS value
 * to do arithmetic and comparisons with, and in doing so it throws type away.
 * A timestamp comes back as a string, and `toValue` then writes that string
 * back as a string. A backup taken and restored through that pair returns
 * every document with the right VALUES and the wrong TYPES — which nothing
 * noticed, because the restore verified counts and the counts were right.
 *
 * What that costs: firestore.rules line 45 does `request.time < s.trialEndsAt`.
 * Comparing a timestamp with a string is a type error in the rules, and an
 * error denies — so a salon on a trial plan, restored, comes back whole and
 * unable to take a single online booking, with nothing saying why.
 *
 * So the backup gets its own pair, and this one is symmetric: dumpValue →
 * loadValue → the same Firestore value, for every type Firestore has. The
 * types JSON cannot express carry a tag:
 *
 *    {"$ts": "2026-…Z"}      timestamp   (a plain string stays a string)
 *    {"$bytes": "<base64>"}  bytes
 *    {"$ref": "projects/…"}  reference
 *    {"$geo": {latitude, longitude}}
 *    {"$int": "9007199254740993"}   integer too big for a JS number
 *    {"$double": 35}         a double whose value is whole (35.0 ≠ 35)
 *    {"$map": {…}}           a map that itself has a key starting with "$"
 *
 * Everything else — null, booleans, ordinary integers and decimals, strings,
 * arrays, maps — stays exactly as JSON writes it, so a backup is still a file
 * a person can open and read.
 */
/** Encoding version of the backup file.
 *  1 = every value passed through fromValue/toValue, which lost type.
 *  2 = dumpValue/loadValue, lossless. */
export const BACKUP_FORMAT = 2;

const TAGS = ['$ts', '$bytes', '$ref', '$geo', '$int', '$double', '$map'];
const isTagged = (o) => o !== null && typeof o === 'object' && !Array.isArray(o)
  && Object.keys(o).length === 1 && TAGS.includes(Object.keys(o)[0]);

/** Firestore REST value → JSON that survives a round trip. */
export function dumpValue(v) {
  if (!v || 'nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) {
    // int64 does not fit a JS number. Past the safe range, keep the digits.
    const n = Number(v.integerValue);
    return Number.isSafeInteger(n) ? n : { $int: String(v.integerValue) };
  }
  if ('doubleValue' in v) {
    const d = v.doubleValue;
    // NaN and ±Infinity have no JSON form; a whole double must not be read
    // back as an integer.
    if (typeof d === 'string' || !Number.isFinite(d)) return { $double: String(d) };
    return Number.isInteger(d) ? { $double: d } : d;
  }
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return { $ts: v.timestampValue };
  if ('bytesValue' in v) return { $bytes: v.bytesValue };
  if ('referenceValue' in v) return { $ref: v.referenceValue };
  if ('geoPointValue' in v) {
    return { $geo: { latitude: v.geoPointValue?.latitude ?? 0, longitude: v.geoPointValue?.longitude ?? 0 } };
  }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dumpValue);
  if ('mapValue' in v) {
    const o = Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dumpValue(x)]));
    return Object.keys(o).some(k => k.startsWith('$')) ? { $map: o } : o;
  }
  throw new Error('dumpValue: tipo desconhecido ' + JSON.stringify(Object.keys(v)));
}

/** The inverse. `loadValue(dumpValue(x))` must equal `x`, for every x. */
export function loadValue(j) {
  if (j === null || j === undefined) return { nullValue: null };
  if (typeof j === 'boolean') return { booleanValue: j };
  if (typeof j === 'number') {
    return Number.isInteger(j) ? { integerValue: String(j) } : { doubleValue: j };
  }
  if (typeof j === 'string') return { stringValue: j };
  if (j instanceof Date) return { timestampValue: j.toISOString() };
  if (Array.isArray(j)) return { arrayValue: { values: j.map(loadValue) } };
  if (typeof j === 'object') {
    if (isTagged(j)) {
      const [tag, x] = Object.entries(j)[0];
      if (tag === '$ts') return { timestampValue: x };
      if (tag === '$bytes') return { bytesValue: x };
      if (tag === '$ref') return { referenceValue: x };
      if (tag === '$geo') return { geoPointValue: { latitude: x?.latitude ?? 0, longitude: x?.longitude ?? 0 } };
      if (tag === '$int') return { integerValue: String(x) };
      if (tag === '$double') return { doubleValue: typeof x === 'string' ? Number(x) : x };
      if (tag === '$map') return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, y]) => [k, loadValue(y)])) } };
    }
    return { mapValue: { fields: Object.fromEntries(Object.entries(j).map(([k, y]) => [k, loadValue(y)])) } };
  }
  throw new Error('loadValue: valor não suportado ' + typeof j);
}

/** A document as it goes into a backup: ids, plus lossless fields. */
export const dumpDoc = (d) => ({
  id: d.name.split('/').pop(),
  path: d.name.split('/documents/')[1],
  ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dumpValue(v)])),
});

/** listAll, but lossless — what the backup walks with. */
export async function listAllDump(token, collectionPath) {
  let out = [], pageToken = '';
  do {
    const j = await api('GET', `${FS}/${collectionPath}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`, token);
    out = out.concat((j.documents || []).map(dumpDoc));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

/** One document, lossless. null when it does not exist. */
export async function getDocumentDump(token, docPath) {
  try { return dumpDoc(await api('GET', `${FS}/${docPath}`, token)); }
  catch (e) { if (e.status === 404) return null; throw e; }
}

export async function api(method, url, token, body) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`${method} ${url} → ${r.status} ${j.error?.status || ''} ${j.error?.message || ''}`); e.status = r.status; e.body = j; throw e; }
  return j;
}
export async function listAll(token, collectionPath) {
  let out = [], pageToken = '';
  do {
    const j = await api('GET', `${FS}/${collectionPath}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`, token);
    out = out.concat((j.documents || []).map(fromDoc));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}
export async function getDocument(token, docPath) {
  try { return fromDoc(await api('GET', `${FS}/${docPath}`, token)); } catch (e) { if (e.status === 404) return null; throw e; }
}
export async function patchDocument(token, docPath, fields, { merge = true } = {}) {
  const mask = merge ? '?' + Object.keys(fields).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&') : '';
  return api('PATCH', `${FS}/${docPath}${mask}`, token, { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) });
}
export async function createDocument(token, collectionPath, id, fields) {
  return api('POST', `${FS}/${collectionPath}${id ? '?documentId=' + encodeURIComponent(id) : ''}`, token, { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) });
}
export async function deleteDocument(token, docPath) { return api('DELETE', `${FS}/${docPath}`, token); }
