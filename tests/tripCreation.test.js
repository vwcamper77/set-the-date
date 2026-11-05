const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { join } = require('node:path');

async function create(status, overrides = {}) {
  const upgrades = [], polls = [], routes = [];
  const source = fs.readFileSync(join(__dirname, '../components/EventBuilder/EventBuilder.js'), 'utf8');
  const start = source.indexOf('  const handleFinalSubmit =');
  const end = source.indexOf('\n  }, [', start);
  const context = vm.createContext({ console, Date, performance: { now: () => 1 }, useCallback: cb => cb,
    isFinalStep: true, handleNextStep() {}, ensureDetailsValid: () => true, ensureDatesSelected: () => true, ensureTripWindowComplete: () => true,
    effectiveGatingEnabled: true, freePollLimit: 1, freeDateLimit: 9, isPro: false,
    creationAttempt: { current: false }, loadOrganiserStatus: async () => status, openUpgradeModal: reason => upgrades.push(reason),
    selectedDates: [new Date(), new Date(Date.now() + 20 * 86400000)], eventType: 'holiday', includeBreakfast: false,
    isSubmitting: false, setIsSubmitting() {}, email: 'audit@example.com', firstName: 'Audit', title: 'Isolated test', location: 'Test location', notes: '',
    normalizeEmail: s => s.trim().toLowerCase(), organiserStatus: { planType: 'free' }, isUnlocked: false,
    deadlineHours: 168, holidayDuration: '2_nights', nanoid: () => 'test-token', Timestamp: { now: () => 1, fromDate: d => d }, entrySource: 'test', partnerPrefill: null,
    db: {}, collection() {}, addDoc: async (_, data) => { polls.push(data); return { id: 'test123' }; }, saveStoredEvent() {}, resetFormAfterCreation() {},
    onSubmit: undefined, fetch: async () => ({ ok: true, json: async () => ({}) }), setOrganiserStatus() {},
    router: { replace: async route => routes.push(route) }, setTimeout() {}, logEventIfAvailable() {},
    ...overrides,
  });
  vm.runInContext(source.slice(start, end) + '\n  });\nglobalThis.submit = handleFinalSubmit;', context);
  await context.submit();
  return { upgrades, polls, routes, context };
}
test('first free trip is created and goes to organiser onboarding with chosen voting deadline', async () => {
  const { polls, upgrades, routes } = await create({ planType: 'free', pollsCreatedCount: 0 });
  assert.equal(polls.length, 1); assert.equal(upgrades.length, 0);
  assert.equal(polls[0].eventType, 'holiday');
  assert.ok(polls[0].deadline.getTime() > Date.now() + 167 * 3600000);
  assert.equal(routes[0], '/trip/test123?onboarding=1&returnTo=share');
});
test('returning free organiser sees explicit poll-limit gate before any record is written', async () => {
  const { polls, upgrades, context } = await create({ planType: 'free', pollsCreatedCount: 1 });
  assert.deepEqual(upgrades, ['poll_limit']); assert.equal(polls.length, 0); assert.equal(context.creationAttempt.current, false);
});
test('fresh Pro entitlement permits creation even when prior UI state was free', async () => {
  const { polls, upgrades } = await create({ planType: 'pro', pollsCreatedCount: 10 });
  assert.equal(polls.length, 1); assert.equal(upgrades.length, 0);
});
test('disabled gating preserves free creation and active request blocks double submit', async () => {
  assert.equal((await create({ pollsCreatedCount: 10 }, { effectiveGatingEnabled: false })).polls.length, 1);
  assert.equal((await create({}, { creationAttempt: { current: true } })).polls.length, 0);
});
