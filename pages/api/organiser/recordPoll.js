import { incrementPollsCreated, normaliseEmail } from '@/lib/organiserService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Missing organiser email' });
  }

  try {
    const record = await incrementPollsCreated(email);
    return res.status(200).json({
      email: normaliseEmail(email),
      planType: record.planType || 'free',
      pollsCreatedCount: record.pollsCreatedCount || 0,
      unlocked: record.unlocked || record.planType === 'pro' || false,
    });
  } catch (err) {
    console.error('organiser/recordPoll error', err);
    return res.status(500).json({ error: 'Failed to record poll creation' });
  }
}
