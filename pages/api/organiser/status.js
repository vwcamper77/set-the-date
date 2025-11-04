import { ensureOrganiser, getOrganiser, normaliseEmail } from '@/lib/organiserService';

const DEFAULT_RESPONSE = {
  planType: 'free',
  pollsCreatedCount: 0,
  stripeCustomerId: null,
  unlocked: false,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, createIfMissing = true } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Missing organiser email' });
  }

  try {
    let organiser = await getOrganiser(email);
    if (!organiser && createIfMissing) {
      organiser = await ensureOrganiser(email);
    }

    if (!organiser) {
      return res.status(200).json({
        ...DEFAULT_RESPONSE,
        email: normaliseEmail(email),
      });
    }

    return res.status(200).json({
      email: organiser.email,
      planType: organiser.planType || 'free',
      pollsCreatedCount: organiser.pollsCreatedCount || 0,
      stripeCustomerId: organiser.stripeCustomerId || null,
      lastUpgradeAt: organiser.lastUpgradeAt || null,
      unlocked: organiser.unlocked || organiser.planType === 'pro' || false,
    });
  } catch (error) {
    console.error('organiser/status error', error);
    return res.status(500).json({ error: 'Failed to load organiser status' });
  }
}
