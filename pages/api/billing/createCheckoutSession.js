import { stripe } from '@/lib/stripe';
import { attachStripeSession, normaliseEmail } from '@/lib/organiserService';

const ONE_TIME_PRICE_ID = process.env.STRIPE_PRICE_ONE_TIME;
const MONTHLY_PRICE_ID = process.env.STRIPE_PRICE_MONTHLY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    email,
    priceType = 'one_time',
    successUrl,
    cancelUrl,
  } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Missing organiser email' });
  }

  const normalisedEmail = normaliseEmail(email);
  const isSubscription = priceType === 'monthly';
  const priceId = isSubscription ? MONTHLY_PRICE_ID : ONE_TIME_PRICE_ID;

  if (!priceId) {
    return res.status(500).json({ error: 'Price configuration missing' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || `${process.env.NEXT_PUBLIC_BASE_URL || 'https://plan.setthedate.app'}/upgrade-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_BASE_URL || 'https://plan.setthedate.app'}/upgrade-cancelled`,
      customer_email: normalisedEmail,
      metadata: {
        organiserEmail: normalisedEmail,
        planType: 'pro',
        priceType,
      },
      allow_promotion_codes: true,
    });

    await attachStripeSession({
      email: normalisedEmail,
      sessionId: session.id,
      customerId: session.customer || null,
    });

    return res.status(200).json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('createCheckoutSession error', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
