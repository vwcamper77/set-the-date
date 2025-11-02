import { getOrganiser, markUpgrade, normaliseEmail } from './organiserService';
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
  const organiser = await getOrganiser(normalisedEmail);

  if (organiser?.lastStripeSessionId === session.id && organiser?.planType === 'pro') {
    return organiser;
  }

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

