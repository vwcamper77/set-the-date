import { db } from '@/lib/firebaseAdmin';
import { buildPublicPollSnapshot } from '@/lib/polls/publicSnapshot';

const normaliseId = (value) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length) return value[0];
  return null;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = normaliseId(req.query?.id);
  if (!id) {
    return res.status(400).json({ error: 'Missing poll id' });
  }

  try {
    const pollSnap = await db.collection('polls').doc(id).get();
    if (!pollSnap.exists) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const snapshot = buildPublicPollSnapshot(pollSnap.data());
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    return res.status(200).json(snapshot);
  } catch (error) {
    console.error('public poll snapshot error', error);
    return res.status(500).json({ error: 'Unable to load poll snapshot' });
  }
}
