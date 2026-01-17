import { stripe } from '@/lib/stripe';
import { normaliseEmail, setPendingStripeSession } from '@/lib/organiserService';

const FALLBACK_STRIPE_PRICE_ID =
  process.env.STRIPE_PRO_PRICE_ID || 'price_1SSFwfLdEkFpf0t0sf2Fp4cq';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, successUrl, cancelUrl } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  const priceCandidates = Array.from(
    new Set(
      [process.env.STRIPE_PRICE_ID, FALLBACK_STRIPE_PRICE_ID].filter(Boolean)
    )
  );

  if (!priceCandidates.length) {
    return res.status(500).json({ error: 'Price configuration missing' });
  }

  try {
    const normalisedEmail = normaliseEmail(email);
    const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://plan.setthedate.app';

    let session = null;
    let lastError = null;
    const successUrlValue = successUrl || `${baseUrl}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrlValue = cancelUrl || baseUrl;

    for (const priceId of priceCandidates) {
      let priceInfo = null;
      try {
        priceInfo = await stripe.prices.retrieve(priceId);
      } catch (priceFetchErr) {
        lastError = priceFetchErr;
        console.warn('Unable to retrieve Stripe price', { priceId, error: priceFetchErr.message });
        continue;
      }

      const isRecurring = Boolean(priceInfo?.recurring);
      const mode = isRecurring ? 'subscription' : 'payment';

      try {
        session = await stripe.checkout.sessions.create({
          mode,
          customer_email: normalisedEmail,
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: successUrlValue,
          cancel_url: cancelUrlValue,
          allow_promotion_codes: true,
          metadata: {
            organiserEmail: normalisedEmail,
            priceId,
          },
        });
        break;
      } catch (priceErr) {
        lastError = priceErr;
        const message = String(priceErr?.message || '').toLowerCase();
        if (!message.includes('inactive')) {
          throw priceErr;
        }
        console.warn('Stripe price inactive, trying fallback price', { priceId, error: priceErr.message });
      }
    }

    if (!session) {
      throw lastError || new Error('Unable to create checkout session');
    }

    try {
      await setPendingStripeSession({ email: normalisedEmail, sessionId: session.id });
    } catch (pendingErr) {
      console.error('setPendingStripeSession failed', pendingErr);
    }

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('createCheckoutSession error', err);
    return res.status(500).json({
      error: err?.message || 'Unable to create checkout session',
    });
  }
}
