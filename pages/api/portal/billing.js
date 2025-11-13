import { stripe } from '@/lib/stripe';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { resolvePortalStripeContext } from '@/lib/portalBilling';

const formatSubscription = (subscription) => {
  if (!subscription) return null;
  const item = subscription.items?.data?.[0];
  const price = item?.price || subscription.plan || {};

  return {
    id: subscription.id,
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    current_period_end: subscription.current_period_end || null,
    current_period_start: subscription.current_period_start || null,
    priceNickname: price.nickname || null,
    amount: typeof price.unit_amount === 'number' ? price.unit_amount : null,
    currency: price.currency || 'gbp',
  };
};

const formatInvoice = (invoice) => ({
  id: invoice.id,
  number: invoice.number || null,
  created: invoice.created || null,
  amount_due: typeof invoice.amount_due === 'number' ? invoice.amount_due : null,
  amount_paid: typeof invoice.amount_paid === 'number' ? invoice.amount_paid : null,
  currency: invoice.currency || 'gbp',
  hosted_invoice_url: invoice.hosted_invoice_url || null,
  status: invoice.status || 'open',
  paid: Boolean(invoice.paid),
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const context = await resolvePortalStripeContext({
      uid: decoded.uid,
      email: decoded.email || decoded.userEmail || '',
    });

    if (!context?.stripeCustomerId) {
      return res.status(200).json({
        portalType: context?.profile?.type || 'pro',
        planType: context?.planType || null,
        stripeCustomerId: null,
        subscription: null,
        invoices: [],
        customerEmail: context?.customerEmail || null,
      });
    }

    const customerId = context.stripeCustomerId;
    const [customer, subscriptionList, invoiceList] = await Promise.all([
      stripe.customers.retrieve(customerId),
      stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 1 }),
      stripe.invoices.list({ customer: customerId, limit: 6 }),
    ]);

    const subscription = subscriptionList?.data?.[0] || null;

    return res.status(200).json({
      portalType: context?.profile?.type || 'pro',
      planType: context?.planType || null,
      stripeCustomerId: customerId,
      subscription: formatSubscription(subscription),
      invoices: Array.isArray(invoiceList?.data) ? invoiceList.data.map(formatInvoice) : [],
      customer: customer && typeof customer === 'object'
        ? { id: customer.id, email: customer.email || null, name: customer.name || null }
        : null,
    });
  } catch (error) {
    const status = error?.statusCode === 401 ? 401 : 500;
    if (status === 500) {
      console.error('portal billing api error', error);
    }
    return res
      .status(status)
      .json({ error: status === 401 ? 'Unauthorised' : 'Unable to load billing details' });
  }
}

