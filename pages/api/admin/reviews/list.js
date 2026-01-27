import { db } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import { serializeFirestoreData } from '@/utils/serializeFirestore';

const parseLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 200;
  return Math.min(Math.max(parsed, 1), 500);
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

    const limit = parseLimit(req.query?.limit);
    const snapshot = await db
      .collection('reviews')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const reviews = snapshot.docs.map((doc) =>
      serializeFirestoreData({ id: doc.id, ...doc.data() })
    );

    return res.status(200).json({ reviews });
  } catch (error) {
    console.error('admin reviews list failed', error);
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: 'Unable to load reviews' });
  }
}
