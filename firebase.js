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
  updatePassword, updateProfile, deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyABK6W0yTe_EQfna5_Sz7DcI9nPwvh5TNw",
  authDomain: "bookit-51575.firebaseapp.com",
  projectId: "bookit-51575",
  storageBucket: "bookit-51575.firebasestorage.app",
  messagingSenderId: "304719409100",
  appId: "1:304719409100:web:15f30b52ee324f00517769"
};

const app  = initializeApp(firebaseConfig);
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
  updatePassword, updateProfile, deleteUser
};
