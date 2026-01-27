import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import { db as adminDb } from '@/lib/firebaseAdmin';
import { serializeFirestoreData } from '@/utils/serializeFirestore';

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

    const snapshot = await adminDb
      .collection('reviews')
      .orderBy('createdAt', 'desc')
      .get();
    const reviews = snapshot.docs.map((doc) =>
      serializeFirestoreData({ id: doc.id, ...doc.data() })
    );

    return res.status(200).json({ reviews });
  } catch (error) {
    console.error('admin reviews fetch failed', error);
    const status = error?.statusCode || 400;
    return res.status(status).json({ error: error?.message || 'Unable to fetch reviews.' });
  }
}
