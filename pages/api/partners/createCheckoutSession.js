import { stripe } from '@/lib/stripe';

const resolveBaseUrl = () => {
  return (
    process.env.NEXT_PUBLIC_MARKETING_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://plan.setthedate.app'
  );
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!process.env.STRIPE_PARTNER_PRICE_ID) {
    return res.status(500).json({ error: 'Missing STRIPE_PARTNER_PRICE_ID' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });
  }

  const trialDays = Number.parseInt(process.env.STRIPE_PARTNER_TRIAL_DAYS || '14', 10);
  const safeTrialDays = Number.isFinite(trialDays) && trialDays > 0 ? trialDays : 14;

  try {
    const baseUrl = resolveBaseUrl();
    const successUrl =
      req.body?.successUrl || `${baseUrl}/partners/welcome?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = req.body?.cancelUrl || `${baseUrl}/partners/start`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: process.env.STRIPE_PARTNER_PRICE_ID,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: safeTrialDays,
      },
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('partner checkout session error', error);
    return res.status(500).json({ error: 'Unable to start checkout session' });
  }
}
