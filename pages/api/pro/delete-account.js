import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { auth as adminAuth, db, FieldValue } from '@/lib/firebaseAdmin';
import { normaliseEmail, organiserRef } from '@/lib/organiserService';
import { resolvePortalStripeContext } from '@/lib/portalBilling';
import { stripe } from '@/lib/stripe';

const cancelActiveSubscriptions = async (stripeCustomerId) => {
  if (!stripeCustomerId) return [];

  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'all',
    limit: 10,
  });

  const cancellable = subscriptions.data.filter((subscription) =>
    ['active', 'trialing', 'past_due', 'unpaid'].includes(subscription.status)
  );

  const cancelled = [];
  for (const subscription of cancellable) {
    const updated = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });
    cancelled.push(updated.id);
  }
  return cancelled;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const tokenEmail = normaliseEmail(decoded.email || decoded.userEmail || '');
    const context = await resolvePortalStripeContext({ uid: decoded.uid, email: tokenEmail });
    const email = normaliseEmail(context?.customerEmail || tokenEmail);

    if (context?.portalType === 'venue') {
      return res.status(403).json({ error: 'Use the venue portal to manage venue accounts.' });
    }

    const cancelledSubscriptions = await cancelActiveSubscriptions(context?.stripeCustomerId);

    if (email) {
      await organiserRef(email).set(
        {
          planType: 'free',
          unlocked: false,
          stripeCustomerId: FieldValue.delete(),
          accountDeletedAt: FieldValue.serverTimestamp(),
          subscriptionCancelRequestedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await db.collection('portalUsers').doc(decoded.uid).delete().catch(() => {});
    await adminAuth.deleteUser(decoded.uid);

    return res.status(200).json({
      deleted: true,
      cancelledSubscriptions,
    });
  } catch (error) {
    const status = error?.statusCode === 401 ? 401 : 500;
    if (status === 500) {
      console.error('pro delete account error', error);
    }
    return res.status(status).json({
      error: status === 401 ? 'Unauthorised' : 'Unable to delete Pro account',
    });
  }
}
