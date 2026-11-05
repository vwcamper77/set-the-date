const crypto = require('node:crypto');
const { nextAction, settings, sendingHours, londonDay, millis, normaliseEmail, baseEligible, legacyState } = require('./policy.cjs');
const { buildEmail } = require('./email.cjs');
const hashEmail = email => crypto.createHash('sha256').update(normaliseEmail(email)).digest('hex');

function createHelpers({ db, sendEmail, now = () => Date.now() }) {
  const configRef = db.collection('organiserHelperSettings').doc('config');
  const runtimeRef = db.collection('organiserHelperSettings').doc('runtime');
  const stateRef = id => db.collection('organiserHelperEvents').doc(id);
  const recipientRef = email => db.collection('organiserHelperRecipients').doc(hashEmail(email));
  const history = db.collection('organiserHelperHistory');
  const data = snapshot => snapshot.data() || {};

  async function context(pollId, read = ref => ref.get()) {
    const pollRef = db.collection('polls').doc(pollId);
    const pollSnap = await read(pollRef);
    if (!pollSnap.exists) return null;
    const poll = data(pollSnap);
    const state = data(await read(stateRef(pollId)));
    if (!baseEligible(poll, state)) return null;
    const recipient = data(await read(recipientRef(poll.organiserEmail)));
    const votes = (await read(pollRef.collection('votes'))).docs.map(data);
    const reviews = poll.finalDate ? (await read(db.collection('reviews').where('pollId', '==', pollId))).docs.map(data) : [];
    const reviewed = reviews.some(review => review.reviewerRole === 'organiser' || review.verifiedOrganiser === true);
    return { poll, state, recipient, votes, reviewed };
  }

  async function preview(cursor) {
    const config = settings(data(await configRef.get()));
    let query = db.collection('polls').orderBy('__name__').limit(40);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    const rows = [];
    // Bound concurrency; no writes, provider calls, or private action URLs in previews.
    for (let index = 0; index < snapshot.docs.length; index += 8) {
      const group = await Promise.all(snapshot.docs.slice(index, index + 8).map(async doc => {
        const state = data(await stateRef(doc.id).get());
        const ctx = await context(doc.id);
        const action = ctx && nextAction({ ...ctx, config, now: now() });
        if (!action && !state.paused && !state.inFlight) return null;
        const poll = data(doc);
        return { pollId: doc.id, title: poll.eventTitle || 'Untitled event', type: action?.type || null, label: state.inFlight ? 'Delivery needs checking' : state.paused ? 'Paused for this event' : action.label,
          paused: !!state.paused, inFlight: !!state.inFlight, lastAttemptAt: millis(state.lastAttemptAt), attempts: state.totalAttempts || 0 };
      }));
      rows.push(...group.filter(Boolean));
    }
    const recent = await history.orderBy('createdAt', 'desc').limit(30).get();
    const week = await history.where('createdAt', '>=', now() - 7 * 86400000).get();
    const states = await db.collection('organiserHelperEvents').get();
    const report = { attempts: week.docs.length, accepted: 0, failed: 0, uncertain: 0, pending: 0, dismissed: 0,
      today: 0, pausedEvents: 0, heldEvents: 0, byType: {} };
    for (const doc of week.docs) {
      const item = data(doc);
      if (Object.hasOwn(report, item.status)) report[item.status] += 1;
      if (londonDay(item.createdAt) === londonDay(now())) report.today += 1;
      report.byType[item.type] = (report.byType[item.type] || 0) + 1;
    }
    for (const doc of states.docs) { const state = data(doc); if (state.paused) report.pausedEvents += 1; if (state.inFlight) report.heldEvents += 1; }

    const runtime = data(await runtimeRef.get());
    return { config, report, rows, nextCursor: snapshot.docs.length === 40 ? snapshot.docs.at(-1).id : null,
      sendingHours: sendingHours(now()), runtime: { lastSchedulerAt: millis(runtime.lastSchedulerAt), lastCompletedAt: runtime.lastCompletedAt || null, lastResult: runtime.lastResult || null, lastErrorAt: runtime.lastErrorAt || null },
      history: recent.docs.map(doc => { const item = data(doc); return { id: doc.id, pollId: item.pollId, title: item.title, type: item.type, status: item.status, createdAt: millis(item.createdAt) }; }) };
  }

  async function sendOne(pollId) {
    const jobRef = history.doc();
    const stopToken = crypto.randomBytes(24).toString('hex');
    const claim = await db.runTransaction(async transaction => {
      const config = settings(data(await transaction.get(configRef)));
      const time = now();
      if (!config.enabled || !sendingHours(time)) return null;
      const ctx = await context(pollId, ref => transaction.get(ref));
      if (!ctx) return null;
      const action = nextAction({ ...ctx, config, now: time });
      if (!action) return null;
      const dayRef = db.collection('organiserHelperDays').doc(londonDay(time));
      const daily = data(await transaction.get(dayRef));
      if ((daily.attempts || 0) >= config.dailyLimit) return null;
      const token = ctx.state.stopToken || stopToken;
      const attempts = { ...ctx.state.attempts, [action.type]: (ctx.state.attempts?.[action.type] || 0) + 1 };
      transaction.set(stateRef(pollId), { ...legacyState(ctx.poll), ...ctx.state, inFlight: jobRef.id, stopToken: token, lastAttemptAt: time, attempts, totalAttempts: (ctx.state.totalAttempts || 0) + 1 });
      transaction.set(recipientRef(ctx.poll.organiserEmail), { lastAttemptAt: time });
      transaction.set(dayRef, { attempts: (daily.attempts || 0) + 1 });
      transaction.set(jobRef, { pollId, title: ctx.poll.eventTitle || 'Untitled event', type: action.type, status: 'pending', createdAt: time });
      return { poll: ctx.poll, type: action.type, token };
    });
    if (!claim) return 'skipped';

    let outcome = 'accepted';
    try {
      await sendEmail(buildEmail({ ...claim, pollId, stopUrl: `https://plan.setthedate.app/reminders/${encodeURIComponent(pollId)}?token=${claim.token}` }));
    } catch (error) {
      outcome = error.definite ? 'failed' : 'uncertain';
    }
    // No automatic retries after ambiguous delivery or a crash after provider acceptance.
    // Keep the event held until an admin checks the provider and dismisses the attempt.
    await db.runTransaction(async transaction => {
      const current = data(await transaction.get(stateRef(pollId)));
      transaction.update(jobRef, { status: outcome, completedAt: now() });
      if (current.inFlight === jobRef.id && outcome !== 'uncertain') {
        transaction.update(stateRef(pollId), { inFlight: null });
      }
    });
    return outcome;
  }

  async function run(cursor, deadline = Infinity) {
    await runtimeRef.set({ lastSchedulerAt: now() }, { merge: true });
    const config = settings(data(await configRef.get()));
    if (!config.enabled || !sendingHours(now())) return { paused: !config.enabled, quietHours: !sendingHours(now()), nextCursor: null };
    let query = db.collection('polls').orderBy('__name__').limit(20);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    const counts = { accepted: 0, failed: 0, uncertain: 0, skipped: 0 };
    let last = cursor || null;
    let processed = 0;
    for (const doc of snapshot.docs) {
      if (now() + 15000 >= deadline) break;
      counts[await sendOne(doc.id)] += 1;
      last = doc.id;
      processed += 1;
    }
    return { ...counts, nextCursor: processed < snapshot.docs.length || snapshot.docs.length === 20 ? last : null };

  }

  async function runScheduled() {
    const owner = crypto.randomUUID();
    const acquired = await db.runTransaction(async transaction => {
      const runtime = data(await transaction.get(runtimeRef));
      if ((runtime.leaseUntil || 0) > now()) return null;
      transaction.set(runtimeRef, { ...runtime, leaseOwner: owner, leaseUntil: now() + 10 * 60000, lastSchedulerAt: now() });
      return { cursor: runtime.cursor || null };
    });
    if (!acquired) return { busy: true };
    const deadline = now() + 220000;
    const totals = { accepted: 0, failed: 0, uncertain: 0, skipped: 0 };
    let cursor = acquired.cursor;
    try {
      do {
        const result = await run(cursor, deadline);
        if (result.paused || result.quietHours) { await runtimeRef.set({lastCompletedAt:now(),lastResult:result,lastErrorAt:null},{merge:true}); return result; }
        for (const key of Object.keys(totals)) totals[key] += result[key] || 0;
        cursor = result.nextCursor;
        await runtimeRef.set({ cursor }, { merge: true });
      } while (cursor && now() + 15000 < deadline);
      const result = { ...totals, paused: false, quietHours: false, nextCursor: cursor, remaining: Boolean(cursor) };
      await runtimeRef.set({lastCompletedAt:now(),lastResult:result,lastErrorAt:null},{merge:true});
      return result;
    } catch (error) {
      await runtimeRef.set({lastErrorAt:now()},{merge:true});
      throw error;
    } finally {
      await db.runTransaction(async transaction => {
        const runtime = data(await transaction.get(runtimeRef));
        if (runtime.leaseOwner === owner) transaction.update(runtimeRef, { leaseUntil: 0, leaseOwner: null });
      });
    }
  }

  async function saveSettings(input) {
    if (typeof input.enabled !== 'boolean' || !Number.isInteger(input.dailyLimit) || input.dailyLimit < 1 || input.dailyLimit > 100) throw new Error('Choose a daily limit between 1 and 100.');
    return db.runTransaction(async transaction => {
      const previous = data(await transaction.get(configRef));
      const runtime = data(await transaction.get(runtimeRef));
      if (input.enabled && now() - (millis(runtime.lastSchedulerAt) || 0) > 2 * 3600000) throw new Error('The hourly scheduler must connect before automatic sending can be enabled.');
      const config = settings({ ...input, activatedAt: previous.activatedAt || (input.enabled ? now() : null) });
      transaction.set(configRef, config);
      return config;
    });
  }
  async function pauseEvent(pollId, paused) { await stateRef(pollId).set({ paused }, { merge: true }); }
  async function dismissAttempt(pollId) {
    await db.runTransaction(async transaction => {
      const state = data(await transaction.get(stateRef(pollId)));
      if (!state.inFlight) return;
      if (now() - millis(state.lastAttemptAt) < 15 * 60000) throw new Error('Wait 15 minutes before dismissing a pending delivery.');
      transaction.update(history.doc(state.inFlight), { status: 'dismissed', completedAt: now() });
      transaction.update(stateRef(pollId), { inFlight: null });
    });
  }
  async function stop(pollId, token) {
    await db.runTransaction(async transaction => {
      const state = data(await transaction.get(stateRef(pollId)));
      if (!token || token !== state.stopToken) { const error = new Error('Invalid reminder link.'); error.statusCode = 403; throw error; }
      transaction.set(stateRef(pollId), { ...state, paused: true });
    });
  }
  return { preview, run, runScheduled, sendOne, saveSettings, pauseEvent, dismissAttempt, stop };
}
module.exports = { createHelpers };
