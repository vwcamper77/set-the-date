// /firebase.js
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getStorage } from 'firebase/storage';

const normaliseBucket = (value) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Accept both modern (.firebasestorage.app) and legacy (.appspot.com) bucket hosts as-is
  return trimmed;
};

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: normaliseBucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Prevent re-initialization (important for Next.js fast refresh!)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize services
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Analytics (only if supported and in browser)
let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

export { db, auth, analytics, storage };
