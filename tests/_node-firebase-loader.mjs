/* Node module loader hooks for the E2E suites.
 *
 * Two jobs, both so the browser code can be imported UNCHANGED:
 *
 *  1. resolve: map the gstatic CDN URLs firebase.js imports onto the `firebase`
 *     npm package.
 *  2. load: in emulator mode, rewrite the projectId inside firebase.js as it is
 *     read, without touching the file on disk.
 *
 * Why (2) exists. The Firestore emulator keeps a SEPARATE database per project
 * id, and `connectFirestoreEmulator` changes the host but never the project. So
 * the REST suites (project demo-bookit) and the SDK suites (projectId
 * "bookit-51575", hard-coded in firebase.js) would land in two different
 * databases inside the same emulator: one seeded, the other empty. Rewriting
 * the id here keeps both on demo-bookit while firebase.js stays exactly as it
 * ships to the browser — the app must not learn that tests exist.
 *
 * It also covers getSecondaryAuth(), which builds its second app from the very
 * same firebaseConfig object.
 */

/** The shape we expect to find, once. */
const PROJECT_ID = /projectId:\s*["'][^"']+["']/g;

/**
 * Swap the project id in a copy of firebase.js's source.
 *
 * Exactly one match, or it throws. A silent zero would leave the suites on the
 * real project id and reading an empty database; a silent two would rewrite
 * something we have not thought about. If firebase.js changes shape we want to
 * be told, not to keep running against the wrong project.
 *
 * @param {string} source firebase.js as read from disk
 * @param {string} projectId the emulator project to use instead
 * @returns {string} the rewritten source
 */
export function rewriteProjectId(source, projectId) {
  const found = String(source).match(PROJECT_ID) || [];
  if (found.length !== 1) {
    throw new Error(
      `_node-firebase-loader: esperava exatamente um projectId no firebase.js, encontrei ${found.length}`
      + `${found.length ? ` (${found.join(' | ')})` : ''}.\n`
      + '  O firebase.js mudou de forma. Corrigir aqui antes de correr as suites:\n'
      + '  sem esta substituição os testes do SDK falam com outro projeto dentro do\n'
      + '  emulador e lêem uma base de dados vazia.');
  }
  return String(source).replace(PROJECT_ID, `projectId: "${projectId}"`);
}

/* Set by tests/_register.mjs via register(..., { data }). null = real target,
   and then nothing here rewrites anything. */
let emulatorProject = null;

export async function initialize(data) {
  emulatorProject = data?.emulatorProject ?? null;
}

export async function resolve(specifier, context, next) {
  const m = /^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|firestore|auth)\.js$/.exec(specifier);
  if (m) return next(`firebase/${m[1]}`, context);
  return next(specifier, context);
}

export async function load(url, context, next) {
  const result = await next(url, context);
  if (!emulatorProject || !url.endsWith('/firebase.js')) return result;

  const source = typeof result.source === 'string'
    ? result.source
    : Buffer.from(result.source).toString('utf8');

  return { ...result, source: rewriteProjectId(source, emulatorProject), shortCircuit: true };
}
