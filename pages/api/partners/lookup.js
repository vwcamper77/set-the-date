import { db } from '@/lib/firebaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug.toLowerCase() : null;
  if (!slug) {
    return res.status(400).json({ message: 'Missing slug' });
  }

  try {
    const snapshot = await db.collection('partners').doc(slug).get();
    if (!snapshot.exists) {
      return res.status(404).json({ message: 'Partner not found' });
    }

    const data = snapshot.data() || {};
    return res.status(200).json({
      slug,
      venueName: data.venueName || '',
      city: data.city || '',
      bookingUrl: data.bookingUrl || '',
      brandColor: data.brandColor || '',
      logoUrl: data.logoUrl || '',
    });
  } catch (error) {
    console.error('partner lookup failed', error);
    return res.status(500).json({ message: 'Unable to load partner' });
  }
}
