const test = require('node:test');
const assert = require('node:assert/strict');
const { nextAction, HOUR, DAY, sendingHours, legacyState } = require('../lib/organiserHelpers/policy.cjs');
const { buildEmail } = require('../lib/organiserHelpers/email.cjs');
const { createHelpers } = require('../lib/organiserHelpers/service.cjs');
const NOW = Date.parse('2026-11-05T12:00:00Z');
const poll = (values = {}) => ({ organiserEmail: 'host@example.com', organiserFirstName: 'Sam', eventTitle: 'Dinner', editToken: 'private-edit-token', createdAt: NOW - 3 * DAY, dates: ['2026-11-12'], ...values });
const decide = (values = {}) => nextAction({ poll: poll(), now: NOW, ...values });

test('share and response helpers distinguish external votes from missing tracking', () => {
  assert.equal(decide().type, 'share');
  assert.equal(decide({ poll: poll({ createdAt: NOW - 23 * HOUR }) }), null);
  assert.equal(decide({ poll: poll({ shareCount: 1 }) }).type, 'votes');
  assert.equal(decide({ votes: [{ email: ' HOST@EXAMPLE.COM ' }] }).type, 'share');
  assert.equal(decide({ votes: [{ email: 'friend@example.com' }] }), null);
  assert.equal(decide({ poll: poll({ shareStatus: 'shared', createdAt: NOW - 8 * DAY }) }), null);
});
test('expired first dates do not stop a trip with future travel dates', () => {
  assert.equal(decide({ poll: poll({ eventType: 'holiday', dates: ['2026-11-01', '2026-11-20'] }) }).type, 'share');
  assert.equal(decide({ poll: poll({ dates: ['2026-11-01', '2026-11-04'] }) }), null);
  assert.equal(decide({ poll: poll({ dates: ['2026-11-05'] }) }).type, 'share');
  assert.equal(decide({ poll: poll({ eventType: 'holiday', dates: [], selectedDates: ['2026-11-01', '2026-11-04'] }) }).type, 'share');
  assert.equal(decide({ poll: poll({ eventType: 'holiday', dates: ['2026-11-01', '2026-11-04'], eventOptions: { flexiblePaddingDays: 0 } }) }), null);
});
test('closing and finalise reminders require the appropriate state and recent deadline', () => {
  const votes = [{ email: 'friend@example.com' }];
  assert.equal(decide({ poll: poll({ deadline: NOW + 12 * HOUR }), votes }).type, 'closing');
  assert.equal(decide({ poll: poll({ deadline: NOW - HOUR }), votes }).type, 'finalise');
  assert.equal(decide({ poll: poll({ deadline: NOW - 8 * DAY }), votes }), null);
  assert.equal(decide({ poll: poll({ deadline: NOW - HOUR }) }), null);
  assert.equal(decide({ poll: poll({ finalDate: '2026-11-12' }), votes }), null);
});
test('review requests require a confirmed past event and no existing organiser review', () => {
  assert.equal(decide({ poll: poll({ finalDate: '2026-11-02' }) }).type, 'review');
  assert.equal(decide({ poll: poll({ finalDate: '2026-11-04' }) }), null);
  assert.equal(decide({ poll: poll({ finalDate: '2026-10-01' }) }), null);
  assert.equal(decide({ poll: poll({ finalDate: '2026-11-02' }), reviewed: true }), null);
  assert.equal(decide({ poll: poll({ finalDate: '2026-11-02', organiserReviewRequestedAt: NOW - 3 * DAY }) }), null);
  assert.equal(decide({ poll: poll({ eventType: 'holiday', finalDate: '2026-11-02' }) }), null);
  assert.equal(decide({ poll: poll({ eventType: 'holiday', finalDate: '2026-10-31', finalEndDate: '2026-11-02' }) }).type, 'review');
});
test('exclude cancelled, archived, test, paused, malformed, and opted-out events', () => {
  for (const value of [{ archived: true }, { cancelled: true }, { status: 'cancelled' }, { isTest: true }, { remindersOptOut: true }, { organiserEmail: 'test@gmail.com' }, { editToken: '' }, { createdAt: 'invalid' }, { dates: [] }]) assert.equal(decide({ poll: poll(value) }), null);
  assert.equal(decide({ state: { paused: true } }), null);
  assert.equal(decide({ state: { inFlight: 'job' } }), null);
  assert.equal(decide({ config: { types: { share: false } } }), null);
});
test('cooldowns, total cap, legacy counts, and snapshotted legacy history are respected', () => {
  assert.equal(decide({ recipient: { lastAttemptAt: NOW - 47 * HOUR } }), null);
  assert.equal(decide({ recipient: { lastAttemptAt: NOW - 48 * HOUR } }).type, 'share');
  assert.equal(decide({ state: { totalAttempts: 6 } }), null);
  assert.equal(decide({ state: { attempts: { share: 2 } } }), null);
  assert.equal(decide({ poll: poll({ shareReminderCount: 2 }) }), null);
  assert.equal(decide({ poll: poll({ shareReminderCount: 100, lastShareReminderSentAt: NOW }), state: legacyState(poll({ shareReminderCount: 1 })) }).type, 'share');
});
test('sending hours follow London daylight saving, not server timezone', () => {
  assert.equal(sendingHours(Date.parse('2026-07-05T08:00:00Z')), true);
  assert.equal(sendingHours(Date.parse('2026-11-05T08:00:00Z')), false);
  assert.equal(sendingHours(Date.parse('2026-07-05T18:00:00Z')), false);
  assert.equal(sendingHours(Date.parse('2026-11-05T18:00:00Z')), true);
});
test('email escapes event text, targets organisers only, and routes trips to trip results', () => {
  const message = buildEmail({ poll: poll({ eventTitle: '<img src=x>', organiserFirstName: '<script>', eventType: 'holiday' }), pollId: 'trip', type: 'finalise', stopUrl: 'https://plan.setthedate.app/reminders/trip?token=stop' });
  assert.equal(message.to.length, 1);
  assert.equal(message.to[0].email, 'host@example.com');
  assert.ok(message.htmlContent.includes('&lt;img src=x&gt;'));
  assert.ok(!message.htmlContent.includes('<script>'));
  assert.ok(message.textContent.includes('/trip-results/trip?token=private-edit-token'));
  assert.ok(message.textContent.includes('Stop reminders for this event'));
});

// Firestore fake enforces reads-before-writes and serialises transactions, so
// overlapping schedulers exercise the real claim and per-recipient limits.
function fixture({ polls = { p1: poll() }, enabled = true, limit = 25, provider = async () => {}, time = NOW } = {}) {
  const records = new Map(Object.entries(polls).map(([id, value]) => [`polls/${id}`, value]));
  records.set('organiserHelperSettings/config', { enabled, dailyLimit: limit });
  const emails = [];
  let nextId = 0;
  let lock = Promise.resolve();
  const snap = path => ({ id: path.split('/').at(-1), exists: records.has(path), data: () => structuredClone(records.get(path)) });
  function ref(path) {
    return { path, id: path.split('/').at(-1), get: async () => snap(path), collection: name => query(`${path}/${name}`), set: async (value, options) => records.set(path, options?.merge ? { ...records.get(path), ...value } : value),
      update: async value => records.set(path, { ...records.get(path), ...value }) };
  }
  function query(path, filters = [], ordering = null, count = Infinity, after = null) {
    return { path, doc: id => ref(`${path}/${id || `job${++nextId}`}`), where: (key, op, value) => query(path, [...filters, [key, value]], ordering, count, after),
      orderBy: (key, direction) => query(path, filters, [key, direction], count, after), limit: limit => query(path, filters, ordering, limit, after), startAfter: id => query(path, filters, ordering, count, id),
      get: async () => {
        let docs = [...records.keys()].filter(key => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1).map(snap);
        docs = docs.filter(doc => filters.every(([key, value]) => doc.data()[key] === value));
        if (ordering) docs.sort((a, b) => { const key = ordering[0]; const av = key === '__name__' ? a.id : a.data()[key]; const bv = key === '__name__' ? b.id : b.data()[key]; return (av < bv ? -1 : av > bv ? 1 : 0) * (ordering[1] === 'desc' ? -1 : 1); });
        if (after) docs = docs.filter(doc => doc.id > after);
        return { docs: docs.slice(0, count) };
      } };
  }
  const db = { collection: path => query(path), runTransaction: callback => {
    const result = lock.then(async () => {
      const writes = [];
      const transaction = { get: async ref => { assert.equal(writes.length, 0, 'Firestore reads must precede writes'); return ref.get(); },
        set: (ref, value, options) => writes.push(() => ref.set(value, options)), update: (ref, value) => writes.push(() => ref.update(value)) };
      const value = await callback(transaction);
      for (const write of writes) await write();
      return value;
    });
    lock = result.catch(() => {});
    return result;
  } };
  const service = createHelpers({ db, now: () => time, sendEmail: async message => { emails.push(message); await provider(); } });
  return { service, records, emails, setTime: value => { time = value; } };
}

test('preview is read-only and excludes private email addresses and action tokens', async () => {
  const { service, records, emails } = fixture();
  const before = structuredClone(records);
  const preview = await service.preview();
  assert.equal(preview.rows[0].type, 'share');
  assert.deepEqual(records, before);
  assert.equal(emails.length, 0);
  assert.ok(!JSON.stringify(preview).includes('private-edit-token'));
  assert.ok(!JSON.stringify(preview).includes('host@example.com'));
});
test('overlapping runs only claim one email per organiser, including separate events', async () => {
  const { service, records, emails } = fixture({ polls: { p1: poll(), p2: poll() } });
  await Promise.all([service.sendOne('p1'), service.sendOne('p1'), service.sendOne('p2')]);
  assert.equal(emails.length, 1);
  assert.equal([...records].filter(([key, value]) => key.startsWith('organiserHelperHistory/') && value.status === 'accepted').length, 1);
});
test('daily cap is enforced across distinct recipients and multiple runs', async () => {
  const { service, emails } = fixture({ limit: 1, polls: { p1: poll(), p2: poll({ organiserEmail: 'another@example.com' }) } });
  await service.run(); await service.run();
  assert.equal(emails.length, 1);
});
test('pause, quiet hours, and event changes before dispatch suppress sends', async () => {
  for (const options of [{ enabled: false }, { time: NOW - 6 * HOUR }]) {
    const { service, emails } = fixture(options);
    await service.run(); assert.equal(emails.length, 0);
  }
  const { service, records, emails } = fixture();
  assert.equal((await service.preview()).rows.length, 1);
  records.set('polls/p1', poll({ finalDate: '2026-11-12' }));
  await service.sendOne('p1'); assert.equal(emails.length, 0);
});
test('provider rejection is never marked accepted and remains subject to cooldown', async () => {
  const { service, records, emails } = fixture({ provider: async () => { const error = new Error('Rejected'); error.definite = true; throw error; } });
  assert.equal(await service.sendOne('p1'), 'failed');
  assert.equal(await service.sendOne('p1'), 'skipped');
  assert.equal(emails.length, 1);
  assert.equal([...records].find(([key]) => key.startsWith('organiserHelperHistory/'))[1].status, 'failed');
});
test('ambiguous provider responses hold the event until an admin checks it', async () => {
  const { service, records, emails, setTime } = fixture({ provider: async () => { throw new Error('Timeout after acceptance'); } });
  assert.equal(await service.sendOne('p1'), 'uncertain');
  setTime(NOW + 2 * DAY);
  assert.equal(await service.sendOne('p1'), 'skipped');
  assert.equal(emails.length, 1);
  await service.dismissAttempt('p1');
  assert.equal(records.get('organiserHelperEvents/p1').inFlight, null);
  assert.equal(records.get('organiserHelperEvents/p1').attempts.share, 1);
});
test('unsubscribe requires the event-specific token and immediately suppresses future reminders', async () => {
  const { service, records, emails, setTime } = fixture();
  await service.sendOne('p1');
  await assert.rejects(service.stop('p1', 'wrong'), /Invalid reminder link/);
  const token = records.get('organiserHelperEvents/p1').stopToken;
  await service.stop('p1', token);
  setTime(NOW + 2 * DAY);
  await service.sendOne('p1');
  assert.equal(emails.length, 1);
});
test('activation requires a recent scheduler heartbeat and pause retains cutover ownership', async () => {
  const { service, records } = fixture({ enabled: false });
  await assert.rejects(service.saveSettings({ enabled: true, dailyLimit: 25 }), /scheduler/);
  await service.run();
  await service.saveSettings({ enabled: true, dailyLimit: 25 });
  await service.saveSettings({ enabled: false, dailyLimit: 25 });
  assert.equal(records.get('organiserHelperSettings/config').activatedAt, NOW);
  assert.equal(records.get('organiserHelperSettings/config').enabled, false);
});
test('existing organiser reviews suppress automatic review requests', async () => {
  const { service, records, emails } = fixture({ polls: { p1: poll({ finalDate: '2026-11-02' }) } });
  records.set('reviews/r1', { pollId: 'p1', reviewerRole: 'organiser' });
  await service.sendOne('p1'); assert.equal(emails.length, 0);
});
test('scheduler scans every page, including a final partial page', async () => {
  const polls = Object.fromEntries(Array.from({ length: 43 }, (_, index) => [`p${String(index).padStart(3, '0')}`, poll({ archived: true })]));
  const { service, emails } = fixture({ polls });
  let cursor = null;
  const totals = [];
  do { const result = await service.run(cursor); totals.push(result.skipped); cursor = result.nextCursor; } while (cursor);
  assert.deepEqual(totals, [20, 20, 3]); assert.equal(emails.length, 0);
});
test('Vercel scheduler scans all pages and prevents overlapping invocations', async () => {
  const polls = Object.fromEntries(Array.from({ length: 43 }, (_, index) => [`p${String(index).padStart(3, '0')}`, poll({ archived: true })]));
  const { service, records } = fixture({ polls });
  const results = await Promise.all([service.runScheduled(), service.runScheduled()]);
  assert.equal(results.filter(result => result.busy).length, 1);
  assert.equal(results.find(result => !result.busy).skipped, 43);
  assert.equal(records.get('organiserHelperSettings/runtime').cursor, null);
  assert.equal(records.get('organiserHelperSettings/runtime').leaseUntil, 0);
});
test('Vercel scheduler resumes from its saved cursor when the time budget expires', async () => {
  const polls = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`p${index}`, poll({organiserEmail:`host${index}@example.com`})]));
  let time = NOW;
  const f = fixture({ polls, provider: async () => { time += 60000; f.setTime(time); } });
  const first = await f.service.runScheduled();
  assert.equal(first.remaining, true);
  assert.equal(f.emails.length, 4);
  assert.equal(f.records.get('organiserHelperSettings/runtime').cursor, 'p3');
  const second = await f.service.runScheduled();
  assert.equal(second.remaining, false);
  assert.equal(f.emails.length, 6);
});
