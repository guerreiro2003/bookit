import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc, query, where,
  orderBy, limit, onSnapshot, serverTimestamp, writeBatch,
  arrayUnion, arrayRemove, increment, runTransaction,
  startAfter, endBefore
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail,
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

export {
  db, auth,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, endBefore,
  onSnapshot, serverTimestamp, writeBatch, runTransaction,
  arrayUnion, arrayRemove, increment,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail,
  updatePassword, updateProfile, deleteUser
};
