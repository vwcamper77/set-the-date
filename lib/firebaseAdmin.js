import admin from 'firebase-admin';

const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

const normaliseBucket = (value) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.endsWith('.firebasestorage.app')) {
    return trimmed.replace('.firebasestorage.app', '.appspot.com');
  }
  return trimmed;
};

const storageBucket =
  normaliseBucket(process.env.FIREBASE_STORAGE_BUCKET) ||
  normaliseBucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) ||
  undefined;

if (!admin.apps.length) {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket,
    });
  } else {
    admin.initializeApp();
  }
}

export const db = admin.firestore();
export const auth = admin.auth();
export const FieldValue = admin.firestore.FieldValue;
export const storage = admin.storage();
export const defaultBucket = storageBucket ? admin.storage().bucket(storageBucket) : null;
