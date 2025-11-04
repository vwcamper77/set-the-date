import { stripe } from '@/lib/stripe';

export default async function handler(req, res) {
  const { session_id: sessionId } = req.query || {};

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing session_id' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return res.status(200).json({
      status: session.payment_status,
      email: session.customer_email || session.customer_details?.email || null,
    });
  } catch (err) {
    console.error('checkoutSession lookup failed', err);
    return res.status(500).json({ error: 'Unable to fetch checkout session' });
  }
}
