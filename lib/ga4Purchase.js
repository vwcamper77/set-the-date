// Server-only: imported by API routes, never by browser components.
const { randomUUID } = require('node:crypto');

function checkoutAnalyticsMetadata(gaCookie) {
  const clientId = typeof gaCookie === 'string'
    ? gaCookie.match(/^GA\d+\.\d+\.(\d+\.\d+)$/)?.[1]
    : null;
  return { ga_client_id: clientId || randomUUID() };
}

function buildPurchasePayload(event) {
  const object = event.data.object;
  let amountPaid;
  let clientId;

  if (event.type === 'checkout.session.completed') {
    // Completed sessions can still be awaiting an asynchronous payment.
    if (object.payment_status !== 'paid') return null;
    amountPaid = object.amount_total;
    clientId = object.metadata?.ga_client_id;
  } else if (event.type === 'invoice.paid') {
    // The initial subscription payment is reported by Checkout, not twice.
    if (object.billing_reason !== 'subscription_cycle') return null;
    amountPaid = object.amount_paid;
    // Stripe snapshots subscription metadata onto invoices. Support both API shapes.
    clientId = object.parent?.subscription_details?.metadata?.ga_client_id
      || object.subscription_details?.metadata?.ga_client_id;
  } else {
    return null;
  }

  if (!Number.isFinite(amountPaid) || amountPaid <= 0 || !object.currency) return null;

  return {
    client_id: clientId || randomUUID(),
    events: [{
      name: 'purchase',
      params: {
        transaction_id: object.id,
        value: amountPaid / 100,
        currency: object.currency.toUpperCase(),
      },
    }],
  };
}

async function sendPurchaseEvent(event) {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  if (!measurementId || !apiSecret) return;

  const payload = buildPurchasePayload(event);
  if (!payload) return;

  try {
    const query = new URLSearchParams({ measurement_id: measurementId, api_secret: apiSecret });
    const response = await fetch(`https://www.google-analytics.com/mp/collect?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn('GA4 purchase delivery failed', { transactionId: event.data.object.id, status: response.status });
    }
  } catch {
    // Do not leak the request URL (API secret) or fail payment fulfilment for analytics.
    console.warn('GA4 purchase delivery failed', { transactionId: event.data.object.id });
  }
}

module.exports = { checkoutAnalyticsMetadata, buildPurchasePayload, sendPurchaseEvent };
