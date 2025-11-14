import { FieldValue, db } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { resolvePortalStripeContext } from '@/lib/portalBilling';
import { ensureOnboardingRecord } from '@/lib/partners/onboardingService';
import { normaliseEmail } from '@/lib/organiserService';

const MAX_PORTAL_VENUES = (() => {
  const limit = Number.parseInt(
    process.env.PORTAL_MAX_VENUES || process.env.NEXT_PUBLIC_PORTAL_MAX_VENUES || '3',
    10
  );
  return Number.isFinite(limit) && limit > 0 ? limit : 3;
})();

const partnersCollection = db.collection('partners');
const onboardingCollection = db.collection('partnersOnboarding');

const countExistingVenues = async (email) => {
  if (!email) {
    return { count: 0, slugs: [] };
  }
  const snapshot = await partnersCollection.where('contactEmail', '==', email).get();
  const slugs = snapshot.docs.map((doc) => doc.id);
  return { count: snapshot.size, slugs };
};

const findPendingOnboardingRecord = async (portalUserId) => {
  if (!portalUserId) return null;
  const snapshot = await onboardingCollection.where('portalUserId', '==', portalUserId).limit(5).get();
  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    if (!data.partnerId) {
      return { ref: doc.ref, data };
    }
  }
  return null;
};

const ensurePortalOnboardingRecord = async ({ portalUserId, stripeCustomerId, email, name }) => {
  if (!portalUserId) {
    throw new Error('Missing portal user id.');
  }
  const pendingRecord = await findPendingOnboardingRecord(portalUserId);
  if (pendingRecord) {
    await pendingRecord.ref.set(
      {
        portalUserId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return pendingRecord;
  }

  const uniqueSessionId = `portal_${portalUserId}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  const record = await ensureOnboardingRecord({
    sessionId: uniqueSessionId,
    stripeCustomerId,
    customerEmail: email,
    customerName: name || '',
  });

  await record.ref.set(
    {
      portalUserId,
      source: 'portal_manual',
      status: 'portal_token_issued',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return record;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const context = await resolvePortalStripeContext({
      uid: decoded.uid,
      email: decoded.email || decoded.userEmail || '',
    });

    if (context?.profile?.type !== 'venue') {
      return res.status(403).json({ error: 'Venue portal access required.' });
    }

    const stripeCustomerId = context?.stripeCustomerId;
    if (!stripeCustomerId) {
      return res.status(402).json({ error: 'Active venue subscription required.' });
    }

    const email =
      normaliseEmail(context?.customerEmail || decoded.email || context?.profile?.email || '') || '';
    if (!email) {
      return res.status(400).json({ error: 'Missing contact email for portal user.' });
    }

    const { count: partnerCount } = await countExistingVenues(email);
    if (partnerCount >= MAX_PORTAL_VENUES) {
      return res.status(409).json({
        error: 'Venue limit reached. Contact Set The Date to unlock enterprise tiers.',
        contactRequired: true,
        partnerCount,
        maxVenues: MAX_PORTAL_VENUES,
      });
    }

    const record = await ensurePortalOnboardingRecord({
      portalUserId: context.profile?.id || decoded.uid,
      stripeCustomerId,
      email,
      name: context.profile?.contactName || context.profile?.venueName || context.profile?.name || '',
    });

    const snapshot = await record.ref.get();
    const data = snapshot.data() || record.data || {};
    const onboardingToken = data.onboardingToken;
    if (!onboardingToken) {
      throw new Error('Unable to resolve onboarding token.');
    }

    return res.status(200).json({
      onboardingToken,
      partnerCount,
      maxVenues: MAX_PORTAL_VENUES,
      remainingSlots: Math.max(MAX_PORTAL_VENUES - partnerCount, 0),
    });
  } catch (error) {
    const status = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (status === 500) {
      console.error('portal issue venue token error', error);
    }
    return res
      .status(status)
      .json({ error: error?.message || 'Unable to issue an additional venue token.' });
  }
}
