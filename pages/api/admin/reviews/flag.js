import { db, FieldValue } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const adminEmail = decoded?.email || decoded?.userEmail || '';
    if (!isAdminEmail(adminEmail)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { reviewId, reason } = req.body || {};
    if (!reviewId || !reason) {
      return res.status(400).json({ error: 'Missing reviewId or reason' });
    }

    const reviewRef = db.collection('reviews').doc(reviewId);
    const reviewSnap = await reviewRef.get();
    if (!reviewSnap.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }

    await reviewRef.update({
      moderationStatus: 'hidden',
      visibility: 'private',
      publicDisplay: false,
      moderationFlags: FieldValue.arrayUnion({
        reason,
        createdAt: new Date().toISOString(),
        adminName: adminEmail,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('admin review flag failed', error);
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: error?.message || 'Unable to flag review' });
  }
}
