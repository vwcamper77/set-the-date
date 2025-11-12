import crypto from 'crypto';
import { auth as adminAuth, db, FieldValue } from '@/lib/firebaseAdmin';
import { findOnboardingByToken } from '@/lib/partners/onboardingService';

const generateRandomPassword = () => {
  const base = crypto.randomBytes(24).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  return base.slice(0, 20) || `Venue${Date.now()}!`;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const onboardingToken = typeof req.body?.onboardingToken === 'string' ? req.body.onboardingToken : '';
  if (!onboardingToken) {
    return res.status(400).json({ message: 'Missing onboarding token' });
  }

  try {
    const record = await findOnboardingByToken(onboardingToken);
    if (!record) {
      return res.status(404).json({ message: 'Unable to find your venue trial.' });
    }

    const rawEmail = record.data?.customerEmail || '';
    const email = rawEmail.trim().toLowerCase();
    if (!email) {
      return res.status(409).json({ message: 'The Stripe checkout is missing an email address. Contact support to continue.' });
    }

    let user;
    try {
      user = await adminAuth.getUserByEmail(email);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        user = await adminAuth.createUser({
          email,
          displayName: record.data?.customerName || '',
          password: generateRandomPassword(),
          emailVerified: false,
          disabled: false,
        });
      } else {
        throw error;
      }
    }

    const now = FieldValue.serverTimestamp();
    const profileRef = db.collection('portalUsers').doc(user.uid);
    const profileSnapshot = await profileRef.get();
    const profilePayload = {
      uid: user.uid,
      email,
      type: 'venue',
      planType: 'venue',
      unlocked: true,
      onboardingToken,
      updatedAt: now,
    };
    if (!profileSnapshot.exists) {
      profilePayload.createdAt = now;
    }
    await profileRef.set(profilePayload, { merge: true });

    if (record.ref && typeof record.ref.update === 'function') {
      try {
        await record.ref.update({ portalUserId: user.uid, updatedAt: now });
      } catch (updateErr) {
        console.error('partners onboarding portal user update failed', updateErr);
      }
    }

    const customToken = await adminAuth.createCustomToken(user.uid, { portalType: 'venue' });

    return res.status(200).json({ token: customToken, email });
  } catch (error) {
    console.error('partner claim access error', error);
    return res.status(400).json({ message: error?.message || 'Unable to unlock partner access' });
  }
}
