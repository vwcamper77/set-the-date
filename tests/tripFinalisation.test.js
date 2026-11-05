const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { join } = require('node:path');
const { addDays, format, differenceInCalendarDays } = require('date-fns');
const iso = offset => format(addDays(new Date(), offset), 'yyyy-MM-dd');
let dates;
test.before(async () => { dates = await import('../lib/tripDates.mjs'); });

async function request(body = {}, pollOverrides = {}, exists = true) {
  const writes = [];
  const poll = { eventType: 'holiday', editToken: 'secret', dates: [iso(-1), iso(10)], eventOptions: { flexiblePaddingDays: 0 }, ...pollOverrides };
  const source = fs.readFileSync(join(__dirname, '../pages/api/finaliseTrip.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default async function handler', 'async function handler');
  const ref = {};
  const context = vm.createContext({ ...dates, differenceInCalendarDays, Date, console, FieldValue: { serverTimestamp: () => 'timestamp' }, db: { collection: () => ({ doc: () => ref }), runTransaction: cb => cb({ get: async () => ({ exists, data: () => poll }), update: (_, value) => writes.push(value) }) } });
  vm.runInContext(source + '\nglobalThis.handler = handler;', context);
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
  await context.handler({ method: 'POST', body: { pollId: 'trip123', editToken: 'secret', start: iso(2), end: iso(4), ...body } }, res);
  return { res, writes };
}

test('organiser confirmation persists both dates and closes availability', async () => {
  const { res, writes } = await request();
  assert.equal(res.code, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].finalDate, iso(2));
  assert.equal(writes[0].finalEndDate, iso(4));
  const confirmed = { eventType: 'holiday', dates: [iso(-1), iso(10)], ...writes[0] };
  assert.equal(dates.getTripAvailability(confirmed), null);
  assert.match(dates.getTripAvailabilityMessage(confirmed), /to .*Availability collection is closed/);
});
test('missing or incorrect organiser token cannot write', async () => {
  for (const editToken of ['', 'wrong', null]) { const result = await request({ editToken }); assert.equal(result.res.code, 403); assert.equal(result.writes.length, 0); }
});
test('past, reversed, impossible and out-of-window ranges cannot write', async () => {
  for (const body of [{ start: iso(-1) }, { end: iso(1) }, { end: iso(20) }, { start: '2026-02-30' }]) {
    const result = await request(body); assert.equal(result.res.code, 400); assert.equal(result.writes.length, 0);
  }
});
test('minimum trip length is enforced and same-day trips work with default minimum', async () => {
  assert.equal((await request({ end: iso(2) })).res.code, 200);
  const result = await request({ end: iso(2) }, { eventOptions: { minTripDays: 3 } });
  assert.equal(result.res.code, 400); assert.equal(result.writes.length, 0);
});
test('deleted and non-trip records cannot be confirmed', async () => {
  assert.equal((await request({}, {}, false)).res.code, 404);
  assert.equal((await request({}, { eventType: 'general' })).res.code, 400);
});
test('retries are idempotent and cannot silently replace a settled plan', async () => {
  const confirmed = { finalDate: iso(2), finalEndDate: iso(4) };
  const retry = await request({}, confirmed); assert.equal(retry.res.code, 200); assert.equal(retry.writes.length, 0);
  const changed = await request({ end: iso(5) }, confirmed); assert.equal(changed.res.code, 409); assert.equal(changed.writes.length, 0);
});
test('confirmed range remains Live through its finish date', async () => {
  const { getPollStatus } = await import('../lib/pollStatus.mjs');
  const poll = { eventType: 'holiday', finalDate: iso(-2), finalEndDate: iso(2) };
  assert.equal(getPollStatus(poll).label, 'Live');
  assert.equal(getPollStatus(poll, addDays(new Date(), 3)).label, 'Passed');
});
