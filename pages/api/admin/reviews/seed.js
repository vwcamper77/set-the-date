import { db as adminDb, FieldValue } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';

const buildMockReviews = () => [
  {
    rating: 5,
    text: 'Everything was smooth and quick. Loved how easy it was to lock a date.',
    firstName: 'Ava',
    city: 'Brighton',
    eventTitle: 'Team dinner',
  },
  {
    rating: 4,
    text: 'Helpful reminders and a simple voting flow. Would use again.',
    firstName: 'Jordan',
    city: 'Manchester',
    eventTitle: 'Birthday brunch',
  },
  {
    rating: 5,
    text: 'Great for coordinating friends without the endless group chat.',
    firstName: 'Sam',
    city: 'London',
    eventTitle: 'Weekend trip',
  },
];

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

    const { force } = req.body || {};
    const existing = await adminDb.collection('reviews').limit(1).get();
    if (!existing.empty && !force) {
      return res.status(200).json({ message: 'Reviews already exist. Use force=true to add more.' });
    }

    const batch = adminDb.batch();
    const createdAt = FieldValue.serverTimestamp();
    const payloads = buildMockReviews().map((review) => ({
      ...review,
      consentPublic: true,
      approvedPublic: true,
      verifiedOrganiser: true,
      createdAt,
      approvedAt: createdAt,
      approvedBy: adminEmail,
    }));

    payloads.forEach((payload) => {
      const ref = adminDb.collection('reviews').doc();
      batch.set(ref, payload);
    });

    await batch.commit();

    return res.status(201).json({ message: 'Mock reviews created', count: payloads.length });
  } catch (error) {
    console.error('admin review seed failed', error);
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: 'Unable to seed mock reviews.' });
  }
}
