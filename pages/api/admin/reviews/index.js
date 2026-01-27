import { db as adminDb } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import { serializeFirestoreData } from '@/utils/serializeFirestore';

const toBoolean = (value) => {
  if (value === undefined) return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const adminEmail = decoded?.email || decoded?.userEmail || '';
    if (!isAdminEmail(adminEmail)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const approvedParam = toBoolean(req.query?.approved);
    const consentParam = toBoolean(req.query?.consentPublic);
    const status = typeof req.query?.status === 'string' ? req.query.status : '';

    const snapshot = await adminDb
      .collection('reviews')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const reviews = snapshot.docs.map((doc) =>
      serializeFirestoreData({ id: doc.id, ...doc.data() })
    );

    const filtered = reviews.filter((review) => {
      const consentValue = Boolean(review.consentPublic);
      const approvedValue = Boolean(review.approvedPublic);
      if (status === 'pending') return consentValue && !approvedValue;
      if (status === 'approved') return approvedValue;
      if (approvedParam !== undefined && approvedValue !== approvedParam) return false;
      if (consentParam !== undefined && consentValue !== consentParam) return false;
      return true;
    });

    return res.status(200).json({ reviews: filtered });
  } catch (error) {
    console.error('admin reviews list failed', error);
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: 'Unable to load reviews.' });
  }
}
