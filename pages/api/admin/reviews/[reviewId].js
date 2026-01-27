import { db as adminDb, FieldValue } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { reviewId } = req.query;
  if (!reviewId || typeof reviewId !== 'string') {
    return res.status(400).json({ error: 'Missing review ID.' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const adminEmail = decoded?.email || decoded?.userEmail || '';
    if (!isAdminEmail(adminEmail)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { approvedPublic } = req.body || {};
    if (typeof approvedPublic !== 'boolean') {
      return res.status(400).json({ error: 'approvedPublic must be boolean.' });
    }

    const updatePayload = {
      approvedPublic,
      approvedAt: approvedPublic ? FieldValue.serverTimestamp() : null,
      approvedBy: approvedPublic ? adminEmail : null,
    };

    await adminDb.collection('reviews').doc(reviewId).set(updatePayload, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('admin review update failed', error);
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: 'Unable to update review.' });
  }
}
