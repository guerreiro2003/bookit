import { register } from 'node:module';

// Once App Check is enforced, requests from Node need a debug token registered
// under Firebase → App Check → Apps → ⋮ → Manage debug tokens.
//   APPCHECK_DEBUG_TOKEN=<uuid> npm run test:all
if (process.env.APPCHECK_DEBUG_TOKEN) {
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.APPCHECK_DEBUG_TOKEN;
}

register('./_node-firebase-loader.mjs', import.meta.url);
