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

export const PROJECT = process.env.FIREBASE_PROJECT || 'bookit-51575';
export const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyABK6W0yTe_EQfna5_Sz7DcI9nPwvh5TNw';
export const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

export async function ownerToken() {
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
  const r = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })).json();
  if (!r.idToken) throw new Error('Sign-in failed: ' + (r.error?.message || 'unknown'));
  return { token: r.idToken, uid: r.localId };
}

export async function signUp(email, password) {
  const r = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
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
