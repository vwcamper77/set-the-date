import { stripe } from '@/lib/stripe';

const resolveBaseUrl = () => {
  return (
    process.env.NEXT_PUBLIC_MARKETING_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://plan.setthedate.app'
  );
};

const PRICE_MAP = {
  usd: {
    monthly: {
      solo: process.env.STRIPE_RENTALS_SOLO_PRICE_ID_USD || process.env.STRIPE_RENTALS_SOLO_PRICE_ID,
      portfolio:
        process.env.STRIPE_RENTALS_PORTFOLIO_PRICE_ID_USD ||
        process.env.STRIPE_RENTALS_PORTFOLIO_PRICE_ID,
      agency:
        process.env.STRIPE_RENTALS_AGENCY_PRICE_ID_USD || process.env.STRIPE_RENTALS_AGENCY_PRICE_ID,
    },
    annual: {
      solo:
        process.env.STRIPE_RENTALS_SOLO_ANNUAL_PRICE_ID_USD ||
        process.env.STRIPE_RENTALS_SOLO_ANNUAL_PRICE_ID,
      portfolio:
        process.env.STRIPE_RENTALS_PORTFOLIO_ANNUAL_PRICE_ID_USD ||
        process.env.STRIPE_RENTALS_PORTFOLIO_ANNUAL_PRICE_ID,
      agency:
        process.env.STRIPE_RENTALS_AGENCY_ANNUAL_PRICE_ID_USD ||
        process.env.STRIPE_RENTALS_AGENCY_ANNUAL_PRICE_ID,
    },
  },
  gbp: {
    monthly: {
      solo: process.env.STRIPE_RENTALS_SOLO_PRICE_ID_GBP,
      portfolio: process.env.STRIPE_RENTALS_PORTFOLIO_PRICE_ID_GBP,
      agency: process.env.STRIPE_RENTALS_AGENCY_PRICE_ID_GBP,
    },
    annual: {
      solo: process.env.STRIPE_RENTALS_SOLO_ANNUAL_PRICE_ID_GBP,
      portfolio: process.env.STRIPE_RENTALS_PORTFOLIO_ANNUAL_PRICE_ID_GBP,
      agency: process.env.STRIPE_RENTALS_AGENCY_ANNUAL_PRICE_ID_GBP,
    },
  },
  eur: {
    monthly: {
      solo: process.env.STRIPE_RENTALS_SOLO_PRICE_ID_EUR,
      portfolio: process.env.STRIPE_RENTALS_PORTFOLIO_PRICE_ID_EUR,
      agency: process.env.STRIPE_RENTALS_AGENCY_PRICE_ID_EUR,
    },
    annual: {
      solo: process.env.STRIPE_RENTALS_SOLO_ANNUAL_PRICE_ID_EUR,
      portfolio: process.env.STRIPE_RENTALS_PORTFOLIO_ANNUAL_PRICE_ID_EUR,
      agency: process.env.STRIPE_RENTALS_AGENCY_ANNUAL_PRICE_ID_EUR,
    },
  },
};

const normalizePlanTier = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const normalizeCadence = (value) => {
  if (value === 'annual') return 'annual';
  return 'monthly';
};

const normalizeCurrency = (value) => {
  if (!value || typeof value !== 'string') return 'usd';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'gbp' || normalized === 'eur' || normalized === 'usd') {
    return normalized;
  }
  return 'usd';
};

const resolveTrialDays = () => {
  const fallback = Number.parseInt(process.env.STRIPE_RENTALS_TRIAL_DAYS || '14', 10);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 14;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { planTier, cadence, currency, successUrl, cancelUrl, ownerId, ownerEmail } = req.body || {};
  const normalizedEmail =
    typeof ownerEmail === 'string' && ownerEmail.trim() ? ownerEmail.trim().toLowerCase() : '';
  const normalizedTier = normalizePlanTier(planTier);
  const normalizedCadence = normalizeCadence(cadence);
  const normalizedCurrency = normalizeCurrency(currency);
  const priceId =
    PRICE_MAP?.[normalizedCurrency]?.[normalizedCadence]?.[normalizedTier] ||
    PRICE_MAP?.usd?.[normalizedCadence]?.[normalizedTier];

  if (!priceId) {
    return res.status(400).json({ error: 'Missing price configuration for plan' });
  }

  try {
    const price = await stripe.prices.retrieve(priceId);
    if (!price || price.active === false) {
      return res.status(400).json({ error: 'Stripe price is inactive or missing' });
    }
    if (!price.recurring) {
      return res.status(400).json({ error: 'Stripe price must be recurring for subscriptions' });
    }

    const trialDays = resolveTrialDays();
    const baseUrl = resolveBaseUrl();
    const successUrlValue = successUrl || `${baseUrl}/rentals/welcome?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrlValue = cancelUrl || `${baseUrl}/rentals/pricing`;

    const metadata = {
      productType: 'rentals',
      priceId,
      planTier: normalizedTier,
    };

    if (ownerId) {
      metadata.rentalsOwnerId = ownerId;
    }

    if (normalizedEmail) {
      metadata.rentalsOwnerEmail = normalizedEmail;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: trialDays,
      },
      success_url: successUrlValue,
      cancel_url: cancelUrlValue,
      allow_promotion_codes: true,
      metadata,
      customer_email: normalizedEmail || undefined,
      client_reference_id: ownerId || undefined,
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('rentals checkout session error', error);
    return res.status(500).json({ error: error?.message || 'Unable to start checkout session' });
  }
}
