import { db, FieldValue } from './firebaseAdmin';
import {
  getOrganiser,
  markUpgrade,
  normaliseEmail,
  organiserIdFromEmail,
} from './organiserService';
import { sendUpgradeConfirmationEmail } from './sendUpgradeEmail';

export const finaliseUpgradeFromSession = async (session) => {
  const email =
    session.customer_details?.email ||
    session.metadata?.organiserEmail ||
    (typeof session.customer === 'object' ? session.customer.email : null);

  if (!email) {
    throw new Error('Unable to resolve organiser email from session');
  }

  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    throw new Error('Session not completed');
  }

  const normalisedEmail = normaliseEmail(email);
  const organiserId = organiserIdFromEmail(normalisedEmail);
  const organiser = await getOrganiser(normalisedEmail);

  if (organiser?.lastStripeSessionId === session.id && organiser?.planType === 'pro') {
    return organiser;
  }

  const paymentsRef = db.collection('payments').doc(session.id);
  const paymentSnapshot = await paymentsRef.get();
  const paymentPayload = {
    organiserId,
    email: normalisedEmail,
    sessionId: session.id,
    amount_total: session.amount_total || null,
    currency: session.currency || 'gbp',
    price_id: session.metadata?.priceId || process.env.STRIPE_PRICE_ID || null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!paymentSnapshot.exists) {
    paymentPayload.createdAt = FieldValue.serverTimestamp();
  }
  await paymentsRef.set(paymentPayload, { merge: true });

  const upgraded = await markUpgrade({
    email: normalisedEmail,
    stripeCustomerId:
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id || null,
    stripeSessionId: session.id,
    planType: 'pro',
  });

  if (organiser?.lastStripeSessionId !== session.id) {
    try {
      await sendUpgradeConfirmationEmail({
        email: normalisedEmail,
        firstName: session.customer_details?.name || organiser?.firstName || '',
      });
    } catch (emailErr) {
      console.error('finaliseUpgradeFromSession email error', emailErr);
    }
  }

  return upgraded;
};
