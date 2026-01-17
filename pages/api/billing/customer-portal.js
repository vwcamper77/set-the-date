import { stripe } from '@/lib/stripe';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { resolvePortalStripeContext } from '@/lib/portalBilling';

const resolveReturnUrl = (portalType = 'pro') => {
  const base =
    process.env.PORTAL_BILLING_RETURN_URL ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://plan.setthedate.app';
  const normalisedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const portalPath = portalType === 'venue' ? '/venues/portal' : '/pro/portal';
  return `${normalisedBase}${portalPath}`;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const context = await resolvePortalStripeContext({
      uid: decoded.uid,
      email: decoded.email || decoded.userEmail || '',
    });

    if (!context?.stripeCustomerId) {
      return res.status(404).json({ error: 'No billing profile found for this account.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: context.stripeCustomerId,
      return_url: resolveReturnUrl(context?.profile?.type),
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    const status = error?.statusCode === 401 ? 401 : 500;
    if (status === 500) {
      console.error('customer portal session error', error);
    }
    return res
      .status(status)
      .json({ error: status === 401 ? 'Unauthorised' : 'Unable to open Stripe billing portal' });
  }
}
