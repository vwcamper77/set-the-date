import { db } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import { stripe } from '@/lib/stripe';

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  if (value._seconds) return value._seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const safeNumber = (value) => (Number.isFinite(value) ? value : null);

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const resolveSubscriptionFromCustomer = async (customerId) => {
  if (!customerId) return null;
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 1,
    expand: ['data.items.data.price', 'data.latest_invoice'],
  });
  return list?.data?.[0] || null;
};

const resolveSubscription = async ({ subscriptionId, customerId }) => {
  if (subscriptionId) {
    try {
      return await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price', 'latest_invoice'],
      });
    } catch (error) {
      console.warn('rentals admin subscription lookup failed', error);
    }
  }
  return resolveSubscriptionFromCustomer(customerId);
};

const resolveInvoiceFromCustomer = async (customerId) => {
  if (!customerId) return null;
  try {
    const list = await stripe.invoices.list({ customer: customerId, limit: 1 });
    return list?.data?.[0] || null;
  } catch (error) {
    console.warn('rentals admin invoice lookup failed', error);
    return null;
  }
};

const buildBillingSummary = async ({ stripeCustomerId, stripeSubscriptionId, subscriptionStatus }) => {
  const summary = {
    subscriptionStatus: normalizeString(subscriptionStatus) || null,
    amountPerPeriod: null,
    currency: null,
    interval: null,
    priceNickname: null,
    lastInvoiceAmount: null,
    lastInvoiceCurrency: null,
    lastInvoiceStatus: null,
    lastInvoiceCreated: null,
  };

  const subscription = await resolveSubscription({
    subscriptionId: stripeSubscriptionId,
    customerId: stripeCustomerId,
  });

  if (subscription) {
    summary.subscriptionStatus = normalizeString(subscription.status) || summary.subscriptionStatus;
    const item = subscription.items?.data?.[0];
    const price = item?.price || null;
    summary.amountPerPeriod = safeNumber(price?.unit_amount);
    summary.currency = normalizeString(price?.currency) || null;
    summary.interval =
      normalizeString(price?.recurring?.interval) ||
      normalizeString(subscription?.plan?.interval) ||
      null;
    summary.priceNickname = normalizeString(price?.nickname) || null;

    const latestInvoice = subscription.latest_invoice;
    if (latestInvoice && typeof latestInvoice === 'object') {
      summary.lastInvoiceAmount = safeNumber(latestInvoice.amount_paid);
      summary.lastInvoiceCurrency =
        normalizeString(latestInvoice.currency) || summary.currency || null;
      summary.lastInvoiceStatus = normalizeString(latestInvoice.status) || null;
      summary.lastInvoiceCreated = latestInvoice.created ? latestInvoice.created * 1000 : null;
    }
  }

  if (!summary.lastInvoiceAmount) {
    const invoice = await resolveInvoiceFromCustomer(stripeCustomerId);
    if (invoice) {
      summary.lastInvoiceAmount = safeNumber(invoice.amount_paid);
      summary.lastInvoiceCurrency =
        normalizeString(invoice.currency) || summary.currency || null;
      summary.lastInvoiceStatus = normalizeString(invoice.status) || null;
      summary.lastInvoiceCreated = invoice.created ? invoice.created * 1000 : null;
    }
  }

  return summary;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const adminEmail = decoded?.email || decoded?.userEmail || '';
    if (!isAdminEmail(adminEmail)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const includeBilling = String(req.query?.billing || '1') !== '0';

    const [ownersSnap, propertiesSnap] = await Promise.all([
      db.collection('rentalsOwners').get(),
      db.collection('rentalsProperties').get(),
    ]);

    const propertiesByOwner = new Map();
    propertiesSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const ownerId = data.ownerId;
      if (!ownerId) return;
      const entry = propertiesByOwner.get(ownerId) || [];
      entry.push({
        id: docSnap.id,
        slug: normalizeString(data.slug),
        propertyName: normalizeString(data.propertyName),
        active: Boolean(data.active),
        createdAt: toMillis(data.createdAt),
      });
      propertiesByOwner.set(ownerId, entry);
    });

    const owners = [];
    for (const docSnap of ownersSnap.docs) {
      const data = docSnap.data() || {};
      const ownerId = docSnap.id;
      const properties = propertiesByOwner.get(ownerId) || [];
      const payload = {
        id: ownerId,
        email: normalizeString(data.email),
        name: normalizeString(data.name || data.contactName || data.companyName),
        planTier: normalizeString(data.planTier),
        propertyLimit: Number.isFinite(data.propertyLimit) ? data.propertyLimit : null,
        subscriptionStatus: normalizeString(data.subscriptionStatus),
        stripeCustomerId: normalizeString(data.stripeCustomerId),
        stripeSubscriptionId: normalizeString(data.stripeSubscriptionId),
        createdAt: toMillis(data.createdAt),
        updatedAt: toMillis(data.updatedAt),
        propertyCount: properties.length,
        properties,
      };

      if (includeBilling) {
        payload.billing = await buildBillingSummary({
          stripeCustomerId: payload.stripeCustomerId,
          stripeSubscriptionId: payload.stripeSubscriptionId,
          subscriptionStatus: payload.subscriptionStatus,
        });
      }

      owners.push(payload);
    }

    owners.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    return res.status(200).json({
      owners,
      generatedAt: Date.now(),
      includeBilling,
    });
  } catch (error) {
    const status = error?.statusCode === 401 ? 401 : 500;
    if (status === 500) {
      console.error('admin rentals owners api error', error);
    }
    return res
      .status(status)
      .json({ error: status === 401 ? 'Unauthorised' : 'Unable to load rentals owners' });
  }
}
