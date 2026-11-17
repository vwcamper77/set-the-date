const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = import('../lib/eventVotingDates.mjs');
test('past options expire individually, while today and future days remain available', async () => {
  const { isUnavailableEventDate } = await helpers;
  const now = new Date(2026, 10, 21, 12);
  assert.equal(isUnavailableEventDate(new Date(2026, 10, 20), now), true);
  assert.equal(isUnavailableEventDate(new Date(2026, 10, 21), now), false);
  assert.equal(isUnavailableEventDate(new Date(2026, 11, 20), now), false);
  assert.equal(isUnavailableEventDate('invalid', now), true);
});
test('midnight expires yesterday and submissions exclude stale positive votes', async () => {
  const { currentEventVotes, isUnavailableEventDate } = await helpers;
  const dates = [new Date(2026, 10, 20).toISOString(), new Date(2026, 10, 24).toISOString()];
  assert.equal(isUnavailableEventDate(dates[0], new Date(2026, 10, 20, 23, 59)), false);
  assert.equal(isUnavailableEventDate(dates[0], new Date(2026, 10, 21)), true);
  assert.deepEqual(currentEventVotes({ [dates[0]]: 'yes', [dates[1]]: 'maybe' }, dates, new Date(2026, 10, 21)), { [dates[1]]: 'maybe' });
});
