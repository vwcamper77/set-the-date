import { auth as adminAuth } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const user = await adminAuth.getUser(decoded.uid);
    const existingClaims = user.customClaims || {};
    if (existingClaims.portalType !== 'rentals') {
      await adminAuth.setCustomUserClaims(user.uid, { ...existingClaims, portalType: 'rentals' });
    }

    const customToken = await adminAuth.createCustomToken(user.uid, { portalType: 'rentals' });
    return res.status(200).json({ token: customToken });
  } catch (error) {
    console.error('rentals claim access error', error);
    return res.status(400).json({ error: error?.message || 'Unable to unlock rentals access' });
  }
}
