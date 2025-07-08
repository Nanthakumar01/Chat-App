import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA1Fu_lxrbpdNSqP8MnSLOliMGZ_a1m7d8",
  authDomain: "chatapp-30bbe.firebaseapp.com",
  projectId: "chatapp-30bbe",
  storageBucket: "chatapp-30bbe.firebasestorage.app",
  messagingSenderId: "716729179229",
  appId: "1:716729179229:web:6f5189e2fab88222cac1b4",
  measurementId: "G-MQ2D5Z0C50"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);