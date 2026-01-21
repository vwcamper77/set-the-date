import { db, FieldValue } from '@/lib/firebaseAdmin';
import { stripe } from '@/lib/stripe';

const normaliseEmail = (value) => {
  if (!value || typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const resolvePriceId = async (session) => {
  if (session?.metadata?.priceId) {
    return session.metadata.priceId;
  }

  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    return lineItems?.data?.[0]?.price?.id || '';
  } catch (error) {
    console.error('rentals line item lookup failed', error);
    return '';
  }
};

const resolveSubscriptionStatus = async (session) => {
  if (session?.subscription?.status) {
    return session.subscription.status;
  }

  const subscriptionId =
    typeof session?.subscription === 'string' ? session.subscription : session.subscription?.id || '';
  if (!subscriptionId) {
    return '';
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription?.status || '';
  } catch (error) {
    console.error('rentals subscription lookup failed', error);
    return '';
  }
};

export const finaliseRentalsSubscriptionFromSession = async (session) => {
  if (!session?.id) {
    throw new Error('Missing checkout session');
  }

  const email = normaliseEmail(
    session.customer_details?.email ||
      session.metadata?.rentalsOwnerEmail ||
      (typeof session.customer === 'object' ? session.customer?.email : '')
  );
  const ownerId = session.metadata?.rentalsOwnerId || session.metadata?.ownerId || '';
  const priceId = await resolvePriceId(session);

  if (!priceId) {
    throw new Error('Missing price for rentals checkout');
  }

  const price = await stripe.prices.retrieve(priceId);
  const planTier = (price?.metadata?.planTier || '').trim().toLowerCase();
  const propertyLimitValue = Number.parseInt(price?.metadata?.propertyLimit || '', 10);
  const propertyLimit = Number.isFinite(propertyLimitValue) ? propertyLimitValue : null;

  const stripeCustomerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id || '';
  const stripeSubscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || '';
  const subscriptionStatus = await resolveSubscriptionStatus(session);

  let ownerRef = null;
  if (ownerId) {
    ownerRef = db.collection('rentalsOwners').doc(ownerId);
  } else if (email) {
    const ownerSnapshot = await db
      .collection('rentalsOwners')
      .where('email', '==', email)
      .limit(1)
      .get();
    if (!ownerSnapshot.empty) {
      ownerRef = ownerSnapshot.docs[0].ref;
    }
  }

  if (!ownerRef) {
    console.warn('rentals checkout owner not found', { sessionId: session.id, email });
    return { status: 'owner_not_found' };
  }

  const payload = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (planTier) {
    payload.planTier = planTier;
  }

  if (propertyLimit !== null) {
    payload.propertyLimit = propertyLimit;
  }

  if (email) {
    payload.email = email;
  }

  if (stripeCustomerId) {
    payload.stripeCustomerId = stripeCustomerId;
  }

  if (stripeSubscriptionId) {
    payload.stripeSubscriptionId = stripeSubscriptionId;
  }

  if (subscriptionStatus) {
    payload.subscriptionStatus = subscriptionStatus;
  }

  await ownerRef.set(payload, { merge: true });

  return { status: 'ok', ownerId: ownerRef.id };
};
