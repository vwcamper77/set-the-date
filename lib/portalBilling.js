import { db } from '@/lib/firebaseAdmin';
import { getOrganiser, normaliseEmail } from '@/lib/organiserService';

const portalUsersCollection = db.collection('portalUsers');
const onboardingCollection = db.collection('partnersOnboarding');

export const getPortalProfile = async (uid) => {
  if (!uid) return null;
  const snapshot = await portalUsersCollection.doc(uid).get();
  if (!snapshot.exists) {
    return null;
  }
  return { id: snapshot.id, ...snapshot.data() };
};

const findPartnerOnboardingRecord = async ({ uid, email }) => {
  if (!uid && !email) return null;

  if (uid) {
    const byPortalId = await onboardingCollection.where('portalUserId', '==', uid).limit(1).get();
    if (!byPortalId.empty) {
      const docSnapshot = byPortalId.docs[0];
      return { id: docSnapshot.id, ...docSnapshot.data() };
    }
  }

  if (email) {
    const normalised = normaliseEmail(email);
    const byEmail = await onboardingCollection.where('customerEmail', '==', normalised).limit(1).get();
    if (!byEmail.empty) {
      const docSnapshot = byEmail.docs[0];
      return { id: docSnapshot.id, ...docSnapshot.data() };
    }
  }

  return null;
};

export const resolvePortalStripeContext = async ({ uid, email }) => {
  const profile = await getPortalProfile(uid);
  const portalType = profile?.type || 'pro';
  const fallbackEmail = email || profile?.email || '';
  const normalisedEmail = normaliseEmail(fallbackEmail);

  if (portalType === 'venue') {
    const onboarding = await findPartnerOnboardingRecord({ uid, email: normalisedEmail });
    const stripeCustomerId = profile?.stripeCustomerId || onboarding?.stripeCustomerId || null;
    return {
      profile,
      portalType,
      stripeCustomerId,
      planType: profile?.planType || 'venue',
      customerEmail: onboarding?.customerEmail || normalisedEmail || null,
      onboarding,
    };
  }

  const organiser = normalisedEmail ? await getOrganiser(normalisedEmail) : null;
  const stripeCustomerId = profile?.stripeCustomerId || organiser?.stripeCustomerId || null;
  return {
    profile,
    portalType,
    organiser,
    stripeCustomerId,
    planType: organiser?.planType || profile?.planType || 'free',
    customerEmail: organiser?.email || normalisedEmail || null,
  };
};

