import getRawBody from 'raw-body';
import { stripe } from '@/lib/stripe';
import { finaliseUpgradeFromSession } from '@/lib/upgradePro';
import { finaliseRentalsSubscriptionFromSession } from '@/lib/rentals/billing';

export const config = {
  api: {
    bodyParser: false,
  },
};

const relevantEvents = new Set(['checkout.session.completed']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return res.status(400).json({ error: 'Missing webhook configuration' });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('stripe webhook signature error', err);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (!relevantEvents.has(event.type)) {
    return res.status(200).json({ received: true });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const productType = session?.metadata?.productType;
      if (productType === 'rentals') {
        await finaliseRentalsSubscriptionFromSession(session);
      } else {
        await finaliseUpgradeFromSession(session);
      }
    }
  } catch (err) {
    console.error('stripe webhook processing error', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  return res.status(200).json({ received: true });
}
