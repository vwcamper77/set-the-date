import { createHash } from 'crypto';
import { db, FieldValue } from './firebaseAdmin';

const HASH_VERSION = 1;
const DEFAULT_PLAN = 'free';
const SALT = process.env.ORGANISER_ID_SALT || 'set-the-date-dev-salt';

export const normaliseEmail = (rawEmail = '') => rawEmail.trim().toLowerCase();

export const organiserIdFromEmail = (email) => {
  const normalised = normaliseEmail(email);
  return createHash('sha256').update(SALT).update(normalised).digest('hex');
};

export const organiserRef = (email) => db.collection('organisers').doc(organiserIdFromEmail(email));

export const getOrganiser = async (email) => {
  const ref = organiserRef(email);
  const snap = await ref.get();
  return snap.exists ? snap.data() : null;
};

export const ensureOrganiser = async (email) => {
  const ref = organiserRef(email);
  const normalised = normaliseEmail(email);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      const payload = {
        email: normalised,
        planType: DEFAULT_PLAN,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        hashVersion: HASH_VERSION,
        pollsCreatedCount: 0,
        firstPollCreatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(ref, payload);
      return payload;
    }
    return snap.data();
  });
};

export const incrementPollsCreated = async (email) => {
  const ref = organiserRef(email);
  const normalised = normaliseEmail(email);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      const payload = {
        email: normalised,
        hashVersion: HASH_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        firstPollCreatedAt: FieldValue.serverTimestamp(),
        planType: DEFAULT_PLAN,
        pollsCreatedCount: 1,
      };
      tx.set(ref, payload);
      return payload;
    }
    const data = snap.data() || {};
    const nextCount = (data.pollsCreatedCount || 0) + 1;
    tx.update(ref, {
      pollsCreatedCount: nextCount,
      updatedAt: FieldValue.serverTimestamp(),
      planType: data.planType || DEFAULT_PLAN,
      hashVersion: HASH_VERSION,
    });
    return { ...data, pollsCreatedCount: nextCount };
  });
};

export const markUpgrade = async ({
  email,
  stripeCustomerId,
  stripeSessionId,
  planType = 'pro',
}) => {
  const ref = organiserRef(email);
  const normalised = normaliseEmail(email);
  await ref.set(
    {
      email: normalised,
      hashVersion: HASH_VERSION,
      planType,
      stripeCustomerId: stripeCustomerId || null,
      lastUpgradeAt: FieldValue.serverTimestamp(),
      lastStripeSessionId: stripeSessionId || null,
      updatedAt: FieldValue.serverTimestamp(),
      pendingStripeSessionId: FieldValue.delete(),
    },
    { merge: true }
  );
  const snap = await ref.get();
  return snap.data();
};

export const attachStripeSession = async ({ email, sessionId, customerId }) => {
  const ref = organiserRef(email);
  const normalised = normaliseEmail(email);
  await ref.set(
    {
      email: normalised,
      hashVersion: HASH_VERSION,
      planType: DEFAULT_PLAN,
      lastCheckoutCreatedAt: FieldValue.serverTimestamp(),
      pendingStripeSessionId: sessionId,
      stripeCustomerId: customerId || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  const snap = await ref.get();
  return snap.data();
};
