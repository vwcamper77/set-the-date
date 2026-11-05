const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
let getTripWindow, getRemainingRange, getTripAvailability, clampTripRange, getPollStatus;
test.before(async () => {
  ({ getTripWindow, getRemainingRange, getTripAvailability, clampTripRange } = await import('../lib/tripDates.mjs'));
  ({ getPollStatus } = await import('../lib/pollStatus.mjs'));
});

const day = (value) => new Date(`${value}T00:00:00`);
const now = new Date('2026-11-05T12:00:00');
const trip = (start, end, padding = 0) => ({ eventType: 'holiday', dates: [start, end], eventOptions: { flexiblePaddingDays: padding } });

test('elapsed start dates do not expire trips with remaining travel days', () => {
  for (const poll of [trip('2026-11-04', '2026-12-02'), trip('2026-11-03', '2026-11-08'), trip('2026-10-23', '2027-01-31')]) {
    assert.equal(getPollStatus(poll, now).label, 'Planning');
    assert.deepEqual(getTripAvailability(poll, now), { start: day('2026-11-05'), end: day(poll.dates[1]) });
  }
});

test('today remains available until the end of the calendar day', () => {
  const poll = trip('2026-11-05', '2026-11-05');
  assert.equal(getPollStatus(poll, new Date('2026-11-05T23:59:59')).label, 'Planning');
  assert.equal(getPollStatus(poll, day('2026-11-06')).label, 'Passed');
  assert.equal(getTripAvailability(poll, day('2026-11-06')), null);
});

test('future and fully elapsed trips retain the correct status', () => {
  assert.equal(getPollStatus(trip('2026-11-13', '2026-12-27'), now).label, 'Planning');
  assert.equal(getPollStatus(trip('2026-11-19', '2026-12-15'), now).label, 'Planning');
  assert.equal(getPollStatus(trip('2026-10-23', '2026-10-28'), now).label, 'Passed');
  assert.equal(getTripAvailability(trip('2026-10-23', '2026-10-28'), now), null);
});

test('whole-window selection clips only past days without changing the stored window', () => {
  const poll = trip('2026-11-04', '2026-12-02');
  const before = JSON.stringify(poll);
  assert.deepEqual(clampTripRange({ from: day('2026-11-04'), to: day('2026-12-02') }, poll, now), {
    from: day('2026-11-05'), to: day('2026-12-02'),
  });
  assert.equal(JSON.stringify(poll), before);
});

test('revalidation at midnight trims crossing ranges and rejects fully elapsed ranges', () => {
  const poll = trip('2026-11-04', '2026-11-10');
  assert.equal(clampTripRange({ from: day('2026-11-04'), to: day('2026-11-04') }, poll, now), null);
  assert.deepEqual(clampTripRange({ from: day('2026-11-04'), to: day('2026-11-06') }, poll, now), {
    from: day('2026-11-05'), to: day('2026-11-06'),
  });
  assert.equal(clampTripRange({ from: day('2026-11-08'), to: day('2026-11-06') }, poll, now), null);
});

test('flexibility padding is preserved, bounded, and never enables past days', () => {
  const poll = trip('2026-11-03', '2026-11-04', 2);
  assert.deepEqual(getTripAvailability(poll, now), { start: day('2026-11-05'), end: day('2026-11-06') });
  assert.equal(getPollStatus(poll, now).label, 'Planning');
  assert.equal(getPollStatus(poll, day('2026-11-07')).label, 'Passed');
  assert.deepEqual(getTripAvailability(trip('2026-11-05', '2026-11-06', 100), now), {
    start: day('2026-11-05'), end: day('2026-11-20'),
  });
  assert.equal(getTripAvailability({ ...poll, eventOptions: {} }, now).end.getTime(), day('2026-11-06').getTime());
});

test('date aliases, unsorted dates and malformed dates are handled safely', () => {
  assert.deepEqual(getTripWindow({ dates: [], selectedDates: ['invalid', '2026-11-10', null, '2026-11-01'] }), {
    start: day('2026-11-01'), end: day('2026-11-10'),
  });
  assert.equal(getTripWindow({ dates: ['invalid', null] }), null);
  assert.equal(getTripAvailability({}, now), null);
  assert.equal(getRemainingRange('invalid', '2026-11-10', now), null);
});

test('regular event status and deadline fallback remain unchanged', () => {
  assert.equal(getPollStatus({ ...trip('2026-11-04', '2026-12-02'), eventType: 'general' }, now).label, 'Passed');
  assert.equal(getPollStatus({ deadline: '2026-11-06T12:00:00' }, now).label, 'Planning');
  assert.equal(getPollStatus({ deadline: { seconds: day('2026-11-04').getTime() / 1000 } }, now).label, 'Passed');
  assert.equal(getPollStatus({ deadline: 'bad' }, now).label, 'Unknown');
});

test('local calendar boundaries work in western and eastern timezones and over DST', () => {
  for (const timezone of ['Europe/London', 'America/Los_Angeles', 'Australia/Melbourne']) {
    execFileSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      import('./lib/tripDates.mjs').then(({ getTripAvailability }) => {
      const poll = { dates: ['2026-10-01', '2026-11-10'], eventOptions: { flexiblePaddingDays: 0 } };
      const now = new Date(2026, 10, 5, 23, 59);
      const range = getTripAvailability(poll, now);
      assert.equal(range.start.getDate(), 5);
      assert.equal(range.start.getHours(), 0);
      assert.equal(range.end.getDate(), 10);
      assert.equal(getTripAvailability(poll, new Date(2026, 10, 11)), null);
      });
    `], { cwd: join(__dirname, '..'), env: { ...process.env, TZ: timezone } });
  }
});

test('results do not count past availability or recommend elapsed days', () => {
  // Exercise the actual results algorithms with a past window that has more votes.
  const source = readFileSync(join(__dirname, '../pages/trip-results/[id].js'), 'utf8');
  const counts = source.slice(source.indexOf('const buildDayCounts ='), source.indexOf('const getRecommendedWindow ='));
  const context = vm.createContext({ ...require('date-fns'), Date, Map,
    toDay: d => new Date(d.getFullYear(), d.getMonth(), d.getDate()),
    buildDayRange: (start, end) => require('date-fns').eachDayOfInterval({ start, end }),
  });
  vm.runInContext(counts + '\nglobalThis.algorithms = { buildDayCounts, getBestCoverageWindow };', context);
  const { buildDayCounts, getBestCoverageWindow } = context.algorithms;
  const remaining = getRemainingRange(day('2026-11-01'), day('2026-11-08'), now);
  const votes = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `past-${i}`, name: `Past ${i}`, windows: [{ start: day('2026-11-01'), end: day('2026-11-04') }] })),
    { id: 'future', name: 'Future', windows: [{ start: day('2026-11-04'), end: day('2026-11-08') }] },
  ];
  const dayCounts = buildDayCounts(remaining.start, remaining.end, votes);
  assert.equal(dayCounts.has(day('2026-11-04').getTime()), false);
  assert.equal(dayCounts.get(day('2026-11-05').getTime()).count, 1);
  const recommended = getBestCoverageWindow(remaining.start, remaining.end, dayCounts, 3);
  assert.equal(recommended.start.getTime(), day('2026-11-05').getTime());
  assert.equal(recommended.end.getTime(), day('2026-11-07').getTime());
  assert.equal(getRemainingRange(day('2026-11-01'), day('2026-11-04'), now), null);
});

for (const eventType of ['holiday', 'general', 'meal']) {
  test(`${eventType}: Live requires a finalised date today`, () => {
    const poll = { ...trip('2026-11-04', '2026-12-02'), eventType };
    assert.notEqual(getPollStatus(poll, now).label, 'Live');
    assert.equal(getPollStatus({ ...poll, finalDate: '2026-11-05' }, now).label, 'Live');
    assert.equal(getPollStatus({ ...poll, finalDate: '2026-11-08' }, now).label, 'Upcoming');
    assert.equal(getPollStatus({ ...poll, finalDate: '2026-11-04' }, now).label, 'Passed');
    assert.notEqual(getPollStatus({ ...poll, finalDate: 'invalid' }, now).label, 'Live');
  });
}

test('unsettled trip remains Planning regardless of votes, deadline or suggested start', () => {
  for (const start of ['2026-11-01', '2026-11-05', '2026-11-08']) {
    for (const totalVotes of [0, 6]) {
      const poll = { ...trip(start, '2026-12-02'), totalVotes, deadline: '2026-11-04' };
      assert.deepEqual(getPollStatus(poll, now).label, 'Planning');
      assert.equal(getPollStatus(poll, now).daysUntil, null);
      assert.ok(getTripAvailability(poll, now));
    }
  }
});

test('confirmed date controls status even outside an expired suggested window', () => {
  assert.equal(getPollStatus({ ...trip('2026-10-01', '2026-10-28'), finalDate: '2026-11-05' }, now).label, 'Live');
  assert.equal(getPollStatus({ finalDate: '2026-11-05' }, now).label, 'Live');
});
