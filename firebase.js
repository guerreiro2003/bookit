import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc, query, where,
  orderBy, limit, onSnapshot, serverTimestamp, writeBatch,
  arrayUnion, arrayRemove, increment, runTransaction,
  startAfter, endBefore, getCountFromServer, deleteField, Timestamp, documentId
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInAnonymously, signOut, onAuthStateChanged, sendPasswordResetEmail,
  sendEmailVerification, updatePassword, updateProfile, deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyABK6W0yTe_EQfna5_Sz7DcI9nPwvh5TNw",
  authDomain: "bookit-51575.firebaseapp.com",
  projectId: "bookit-51575",
  storageBucket: "bookit-51575.firebasestorage.app",
  messagingSenderId: "304719409100",
  appId: "1:304719409100:web:15f30b52ee324f00517769"
};

/* ── App Check ──────────────────────────────────────────────────────────────
   The security rules can say WHO may write, but not HOW OFTEN or FROM WHERE.
   App Check closes that gap: it proves the request came from this site in a
   real browser, which is what stops a script from hammering the public write
   paths (bookings, agenda holds, account sign-ups).

   To turn it on — three steps, all in the console, no code change here:
     1. Firebase → App Check → Apps → register the web app with reCAPTCHA v3
        (it creates the reCAPTCHA site key for you).
     2. Paste that site key into RECAPTCHA_SITE_KEY below and deploy.
     3. Watch App Check → Metrics for a few days. When "verified requests" is
        essentially everything, switch Firestore and Authentication to Enforced.

   Until step 2 the block below does nothing, so the app runs exactly as now.
   NOTE for tests: once enforcement is on, Node scripts need a debug token —
   register one under App Check → Apps → ⋮ → Manage debug tokens and export it
   as APPCHECK_DEBUG_TOKEN (tests/_register.mjs picks it up).                */
const RECAPTCHA_SITE_KEY = '';

const app  = initializeApp(firebaseConfig);

if (RECAPTCHA_SITE_KEY && typeof window !== 'undefined') {
  try {
    const { initializeAppCheck, ReCaptchaV3Provider } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js');
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // A failure here must never take the booking page down with it.
    console.error('App Check não arrancou:', e);
  }
}

const db   = getFirestore(app);
const auth = getAuth(app);

/** Secondary Auth instance used by the admin panel to create/rotate the
 *  per-salon team account WITHOUT signing the admin out of the main session. */
let _secondaryAuth = null;
export function getSecondaryAuth() {
  if (!_secondaryAuth) _secondaryAuth = getAuth(initializeApp(firebaseConfig, 'bookit-secondary'));
  return _secondaryAuth;
}

export {
  app, db, auth, firebaseConfig,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, endBefore, documentId,
  onSnapshot, serverTimestamp, writeBatch, runTransaction,
  arrayUnion, arrayRemove, increment, getCountFromServer, deleteField, Timestamp,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInAnonymously, signOut, onAuthStateChanged, sendPasswordResetEmail,
  sendEmailVerification, updatePassword, updateProfile, deleteUser
};
