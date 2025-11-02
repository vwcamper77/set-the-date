import { stripe } from '@/lib/stripe';
import { finaliseUpgradeFromSession } from '@/lib/upgradePro';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { sessionId } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer'],
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(400).json({ error: 'Session not completed' });
    }

    const email =
      session.customer_details?.email ||
      session.metadata?.organiserEmail ||
      (typeof session.customer === 'object' ? session.customer.email : null);

    const upgraded = await finaliseUpgradeFromSession({
      ...session,
      metadata: session.metadata || {
        organiserEmail: email,
        planType: 'pro',
      },
    });

    return res.status(200).json({
      planType: upgraded.planType,
      stripeCustomerId: upgraded.stripeCustomerId || null,
    });
  } catch (error) {
    console.error('upgradeToPro error', error);
    return res.status(500).json({ error: 'Upgrade failed' });
  }
}
