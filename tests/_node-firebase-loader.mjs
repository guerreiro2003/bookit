/* Node module loader hook: lets tests import the browser code (app.js →
 * firebase.js) unchanged by mapping the gstatic CDN URLs to the `firebase`
 * npm package. Registered via tests/_register.mjs. */
export async function resolve(specifier, context, next) {
  const m = /^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|firestore|auth)\.js$/.exec(specifier);
  if (m) return next(`firebase/${m[1]}`, context);
  return next(specifier, context);
}
