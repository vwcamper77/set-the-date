import admin from 'firebase-admin';

const privateKey = (() => {
  const base64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  if (base64) {
    try {
      return Buffer.from(base64, 'base64').toString('utf8');
    } catch {
      // fall through to plain env handling
    }
  }
  if (process.env.FIREBASE_PRIVATE_KEY) {
    return process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  return undefined;
})();

const normaliseBucket = (value) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Accept both modern (.firebasestorage.app) and legacy (.appspot.com) bucket hosts
  return trimmed;
};

const storageBucket =
  normaliseBucket(process.env.FIREBASE_STORAGE_BUCKET) ||
  normaliseBucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) ||
  undefined;

const useServiceAccount =
  Boolean(process.env.FIREBASE_CLIENT_EMAIL) &&
  Boolean(process.env.FIREBASE_PROJECT_ID) &&
  Boolean(privateKey);

if (!admin.apps.length) {
  if (useServiceAccount) {
    // eslint-disable-next-line no-console
    console.log('Firebase Admin: initialising with service account env vars.', {
      projectId: process.env.FIREBASE_PROJECT_ID ? 'set' : 'missing',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? 'set' : 'missing',
      keyLength: privateKey ? privateKey.length : 0,
    });
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket,
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn('Firebase Admin: falling back to application default credentials; check env vars.');
    admin.initializeApp();
  }
}

export const db = admin.firestore();
export const auth = admin.auth();
export const FieldValue = admin.firestore.FieldValue;
export const storage = admin.storage();
export const defaultBucket = storageBucket ? admin.storage().bucket(storageBucket) : null;
