import { db, FieldValue } from '@/lib/firebaseAdmin';
import { customAlphabet } from 'nanoid';

const tokenAlphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
const generateToken = customAlphabet(tokenAlphabet, 28);
const COLLECTION = 'partnersOnboarding';

const onboardingCollection = db.collection(COLLECTION);

export const ensureOnboardingRecord = async ({
  sessionId,
  stripeCustomerId,
  customerEmail = '',
  customerName = '',
}) => {
  if (!sessionId) {
    throw new Error('Missing sessionId');
  }

  const docRef = onboardingCollection.doc(sessionId);
  const snapshot = await docRef.get();
  if (snapshot.exists) {
    const data = snapshot.data();
    return {
      ref: docRef,
      data,
    };
  }

  const onboardingToken = generateToken();
  const payload = {
    sessionId,
    stripeCustomerId: stripeCustomerId || '',
    customerEmail,
    customerName,
    onboardingToken,
    status: 'token_issued',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await docRef.set(payload);
  return {
    ref: docRef,
    data: payload,
  };
};

export const findOnboardingByToken = async (token) => {
  if (!token) return null;
  const snapshot = await onboardingCollection.where('onboardingToken', '==', token).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return {
    ref: doc.ref,
    data: doc.data(),
  };
};

export const markOnboardingComplete = async ({ token, partnerId, slug }) => {
  const record = await findOnboardingByToken(token);
  if (!record) {
    throw new Error('Invalid onboarding token');
  }

  await record.ref.update({
    status: 'partner_created',
    partnerId,
    partnerSlug: slug,
    updatedAt: FieldValue.serverTimestamp(),
  });
};
