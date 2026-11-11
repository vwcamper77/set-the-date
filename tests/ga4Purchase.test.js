const assert = require('node:assert/strict');
const test = require('node:test');
const { checkoutAnalyticsMetadata, buildPurchasePayload, sendPurchaseEvent } = require('../lib/ga4Purchase');

const checkout = (overrides = {}) => ({
  type: 'checkout.session.completed',
  data: { object: {
    id: 'cs_test_purchase', payment_status: 'paid', amount_total: 1250,
    currency: 'gbp', metadata: { ga_client_id: '123.456' }, ...overrides,
  } },
});
const invoice = (overrides = {}) => ({
  type: 'invoice.paid',
  data: { object: {
    id: 'in_renewal', billing_reason: 'subscription_cycle', amount_paid: 999,
    currency: 'usd', subscription_details: { metadata: { ga_client_id: '123.456' } },
    ...overrides,
  } },
});

test('extracts the GA client ID and generates random fallback metadata', () => {
  assert.deepEqual(checkoutAnalyticsMetadata('GA1.1.123.456'), { ga_client_id: '123.456' });
  for (const cookie of [undefined, '', 'malformed']) {
    const first = checkoutAnalyticsMetadata(cookie).ga_client_id;
    assert.match(first, /^[0-9a-f-]{36}$/);
    assert.notEqual(first, checkoutAnalyticsMetadata(cookie).ga_client_id);
  }
});

test('checkout purchase uses the discounted total, Stripe ID and currency', () => {
  const event = checkout({ amount_subtotal: 2500 });
  const expected = {
    client_id: '123.456',
    events: [{ name: 'purchase', params: {
      transaction_id: 'cs_test_purchase', value: 12.5, currency: 'GBP',
    } }],
  };
  assert.deepEqual(buildPurchasePayload(event), expected);
  assert.deepEqual(buildPurchasePayload(event), expected); // same transaction on retries
});

test('renewals use amount actually paid and subscription metadata', () => {
  assert.deepEqual(buildPurchasePayload(invoice({ total: 2000 })), {
    client_id: '123.456',
    events: [{ name: 'purchase', params: {
      transaction_id: 'in_renewal', value: 9.99, currency: 'USD',
    } }],
  });
  assert.equal(buildPurchasePayload(invoice({
    subscription_details: null,
    parent: { subscription_details: { metadata: { ga_client_id: '789.012' } } },
  })).client_id, '789.012');
});

test('skips zero payments, unpaid checkouts, initial invoices and unrelated events', () => {
  for (const event of [
    checkout({ amount_total: 0 }), checkout({ payment_status: 'unpaid' }),
    invoice({ amount_paid: 0 }), invoice({ billing_reason: 'subscription_create' }),
    invoice({ billing_reason: 'subscription_update' }),
    { ...checkout(), type: 'customer.updated' },
  ]) assert.equal(buildPurchasePayload(event), null);
});

test('legacy sessions and invoices without metadata get a random client ID', () => {
  assert.match(buildPurchasePayload(checkout({ metadata: null })).client_id, /^[0-9a-f-]{36}$/);
  assert.match(buildPurchasePayload(invoice({ subscription_details: null })).client_id, /^[0-9a-f-]{36}$/);
});

test('delivery uses server env configuration and contains failures', async (t) => {
  const previous = { id: process.env.GA4_MEASUREMENT_ID, secret: process.env.GA4_API_SECRET };
  t.after(() => {
    for (const [key, value] of [['GA4_MEASUREMENT_ID', previous.id], ['GA4_API_SECRET', previous.secret]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.GA4_MEASUREMENT_ID = 'G-UNIT-TEST';
  process.env.GA4_API_SECRET = 'unit-test-placeholder';
  const requests = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url: new URL(url), options });
    return { ok: true };
  });
  await sendPurchaseEvent(checkout());
  assert.equal(requests[0].url.origin, 'https://www.google-analytics.com');
  assert.equal(requests[0].url.pathname, '/mp/collect');
  assert.equal(requests[0].url.searchParams.get('measurement_id'), 'G-UNIT-TEST');
  assert.equal(requests[0].url.searchParams.get('api_secret'), 'unit-test-placeholder');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), buildPurchasePayload(checkout()));
  await sendPurchaseEvent(invoice({ amount_paid: 0 }));
  delete process.env.GA4_API_SECRET;
  await sendPurchaseEvent(checkout());
  assert.equal(requests.length, 1);
  process.env.GA4_API_SECRET = 'unit-test-placeholder';
  const warnings = t.mock.method(console, 'warn', () => {});
  t.mock.method(global, 'fetch', async () => { throw new Error('secret-bearing URL'); });
  await assert.doesNotReject(sendPurchaseEvent(checkout()));
  assert.equal(warnings.mock.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(warnings.mock.calls[0].arguments), /secret-bearing/);
});
