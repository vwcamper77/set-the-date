import { stripe } from '@/lib/stripe';
import { normaliseEmail, setPendingStripeSession } from '@/lib/organiserService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, successUrl, cancelUrl } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  if (!process.env.STRIPE_PRICE_ID) {
    return res.status(500).json({ error: 'Price configuration missing' });
  }

  try {
    const normalisedEmail = normaliseEmail(email);
    const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://plan.setthedate.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: normalisedEmail,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: successUrl || `${baseUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || baseUrl,
      allow_promotion_codes: true,
      metadata: {
        organiserEmail: normalisedEmail,
        priceId: process.env.STRIPE_PRICE_ID,
      },
    });

    await setPendingStripeSession({ email: normalisedEmail, sessionId: session.id });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('createCheckoutSession error', err);
    return res.status(500).json({ error: 'Unable to create checkout session' });
  }
}
