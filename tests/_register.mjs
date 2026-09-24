/* Bootstrap for every E2E suite: `node --import ./tests/_register.mjs <suite>`
 *
 * Runs before the suite is even resolved, which is the only place some of this
 * can happen:
 *
 *  1. Choose the target. Tests go to the EMULATOR unless told otherwise, and
 *     this has to be decided before scripts/_lib.mjs is imported, because that
 *     module reads BOOKIT_TARGET once, at load, to build its endpoints.
 *     `BOOKIT_TARGET=real` still sends a suite at production, on purpose and
 *     in writing — see DEPLOY.md.
 *  2. Seal the network. In emulator mode nothing may leave the machine.
 *  3. Register the loader hook, so the browser code can be imported unchanged.
 *  4. Point the Firebase JS SDK at the emulators — including the SECOND app
 *     instance the admin panel creates, which is easy to miss and creates real
 *     accounts when missed.
 */
import { register } from 'node:module';
import path from 'node:path';

// 1. Tests default to the emulator. Anything explicit wins.
process.env.BOOKIT_TARGET ||= 'emulator';
const EMULATOR = process.env.BOOKIT_TARGET === 'emulator';

// 2. Nothing leaves this machine while we are pretending.
if (EMULATOR) await import('./_no-remote.mjs');

// Once App Check is enforced, requests from Node need a debug token registered
// under Firebase → App Check → Apps → ⋮ → Manage debug tokens.
//   APPCHECK_DEBUG_TOKEN=<uuid> npm run test:all
if (process.env.APPCHECK_DEBUG_TOKEN) {
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.APPCHECK_DEBUG_TOKEN;
}

/* 3. Must happen before firebase.js is imported — it imports gstatic URLs, and
      in emulator mode its projectId is rewritten as the file is read. The
      project travels through register()'s `data`, because the hooks run on
      their own thread and this is the supported way to tell them anything.

      Why the rewrite at all: the Firestore emulator keeps a separate database
      per project id, and connectFirestoreEmulator() changes the host but not
      the project — so without this the SDK suites would read an empty database
      under `bookit-51575` while everything else used the seeded demo-bookit.
      scripts/_lib.mjs imports nothing from the browser, so reading it here is
      safe before the hook exists. */
const { PROJECT } = await import('../scripts/_lib.mjs');
register('./_node-firebase-loader.mjs', import.meta.url, {
  data: { emulatorProject: EMULATOR ? PROJECT : null },
});

/* 4. Connect the SDK. Dynamic, so the loader hook above is already in place;
      safe here because firebase.js performs no Firestore or Auth operation at
      import time — it only builds the app, the db and the auth handles. */
if (EMULATOR) {
  const [fb, { connectFirestoreEmulator }, { connectAuthEmulator }] = await Promise.all([
    import('../firebase.js'),
    import('firebase/firestore'),
    import('firebase/auth'),
  ]);
  const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  const authUrl = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`;

  connectFirestoreEmulator(fb.db, fsHost, Number(fsPort));
  connectAuthEmulator(fb.auth, authUrl, { disableWarnings: true });

  /* The one that bites. app.js creates a SECOND Firebase app lazily, inside
     getSecondaryAuth(), so the owner is not signed out while creating a staff
     account. Nothing here can reach that instance after the fact, so build it
     now — it is memoised — and connect it too. Without this, grantStaffAccess()
     in tests/team-access.e2e.mjs creates real accounts in the real project
     while everything else talks to the emulator. */
  connectAuthEmulator(fb.getSecondaryAuth(), authUrl, { disableWarnings: true });
}

/* Say where this suite is pointing, before it does anything. "It ran green" is
   worth nothing until you know what it ran against. The SDK's own project id
   is printed too: it is rewritten at load time, and a silent failure there
   would mean reading an empty database. */
const { targetSummary } = await import('../scripts/_lib.mjs');
let sdk = '';
if (EMULATOR) {
  const fb = await import('../firebase.js');
  sdk = ` · SDK projectId ${fb.app.options.projectId}/${fb.getSecondaryAuth().app.options.projectId}`;
}
console.log(`\n▸ ${path.basename(process.argv[1] || 'suite')} → ${targetSummary()}${sdk}`);
