import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import { db } from '@/lib/firebaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { slug } = req.body || {};
  if (!slug) {
    return res.status(400).json({ error: 'Missing venue slug' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const adminEmail = decoded?.email || decoded?.userEmail || '';
    if (!isAdminEmail(adminEmail)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const ref = db.collection('partners').doc(slug);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    await ref.delete();
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('admin partner delete failed', error);
    return res.status(400).json({ error: error?.message || 'Unable to delete venue' });
  }
}
