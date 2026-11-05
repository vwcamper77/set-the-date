const HOUR = 3600000;
const DAY = 24 * HOUR;
const TYPES = {
  share: { label: 'Share the event', limit: 2 },
  votes: { label: 'Chase responses', limit: 2 },
  closing: { label: 'Voting closes soon', limit: 1 },
  finalise: { label: 'Finalise the date', limit: 2 },
  review: { label: 'Ask for a review', limit: 1 },
};
const TEST_EMAILS = new Set(['gavinfern@hotmail.com', 'hello@setthedate.app', 'test@gmail.com', 'setthedateapp@gmail.com', 'booking@chateaumontfelix.com', 'nicheescapes@gmail.com']);

function millis(value) {
  if (value == null || value === '') return null;
  const date = value?.toDate ? value.toDate() : value?.seconds != null ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}
function normaliseEmail(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function count(value) { return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0; }
function londonDay(now) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now)); }
function sendingHours(now) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
  return hour >= 9 && hour < 19;
}
function settings(data = {}) {
  return { enabled: data.enabled === true, activatedAt: millis(data.activatedAt), dailyLimit: Math.min(100, Math.max(1, count(data.dailyLimit) || 25)),
    types: Object.fromEntries(Object.keys(TYPES).map(key => [key, data.types?.[key] !== false])) };
}
function legacyCount(poll, type) {
  return count({ share: poll.shareReminderCount, votes: poll.lowVotesReminderCount,
    closing: poll.closingSoonReminderSent ? 1 : 0,
    finalise: poll.postDeadlineReminderCount || (poll.postDeadlineReminderSent ? 1 : 0),
    review: poll.organiserReviewRequestedAt ? 1 : 0 }[type]);
}
function legacyState(poll) {
  return { legacyCounts: Object.fromEntries(Object.keys(TYPES).map(type => [type, legacyCount(poll, type)])),
    lastLegacyAt: Math.max(0, ...['lastShareReminderSentAt', 'lastLowVotesReminder', 'lastClosingSoonReminder', 'lastPostDeadlineReminder', 'organiserReviewRequestedAt'].map(key => millis(poll[key]) || 0)) };
}
function baseEligible(poll, state = {}) {
  const email = normaliseEmail(poll.organiserEmail);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !TEST_EMAILS.has(email) && Boolean(poll.editToken) &&
    !poll.archived && !poll.cancelled && !poll.canceled && !poll.isCancelled && !['cancelled', 'canceled', 'archived'].includes(poll.status) &&
    !poll.isTest && !poll.testMode && !poll.remindersOptOut && !state.paused && !state.inFlight;
}

// Pure decision function used for both the preview and the send-time recheck.
function nextAction({ poll, state = {}, recipient = {}, votes = [], reviewed = false, config = {}, now = Date.now() }) {
  config = settings(config);
  if (!baseEligible(poll, state)) return null;
  const legacy = state.legacyCounts ? state : legacyState(poll);
  const lastAttempt = Math.max(millis(state.lastAttemptAt) || 0, millis(recipient.lastAttemptAt) || 0, legacy.lastLegacyAt || 0);
  if (now - lastAttempt < 48 * HOUR || count(state.totalAttempts) >= 6) return null;
  const created = millis(poll.createdAt);
  const deadline = millis(poll.deadline);
  const final = millis(poll.finalDate);
  const dates = (Array.isArray(poll.dates) ? poll.dates : []).map(millis).filter(value => value !== null);
  const latest = dates.length ? Math.max(...dates) : null;
  const today = londonDay(now);
  const hasFutureDates = dates.some(date => londonDay(date) >= today);
  const nonOrganiserVotes = votes.filter(vote => normaliseEmail(vote.email) !== normaliseEmail(poll.organiserEmail));
  const shared = poll.shareStatus === 'shared' || count(poll.shareCount) > 0 || Boolean(poll.firstSharedAt) || nonOrganiserVotes.length > 0;
  let type;
  if (final !== null) {
    // A trip's proposed window is not proof it happened. Require a confirmed end.
    const end = poll.eventType === 'holiday' ? millis(poll.finalEndDate) : final;
    if (end === null || now < end + 2 * DAY || now > end + 14 * DAY || reviewed || poll.organiserReviewRequestedAt) return null;
    type = 'review';
  } else {
    if (poll.finalDate || created === null || now < created || !hasFutureDates || latest === null) return null;
    if (deadline !== null && deadline <= now) {
      if (now - deadline > 7 * DAY || nonOrganiserVotes.length === 0) return null;
      type = 'finalise';
    } else if (deadline !== null && deadline - now <= DAY && nonOrganiserVotes.length < 3 && shared) {
      type = 'closing';
    } else if (!shared && now - created >= DAY && now - created <= 7 * DAY) {
      type = 'share';
    } else if (shared && nonOrganiserVotes.length === 0 && now - created >= 2 * DAY && now - created <= 7 * DAY) {
      type = 'votes';
    } else if ((deadline === null) && nonOrganiserVotes.length >= 3 && now - created >= 3 * DAY && now - created <= 30 * DAY) {
      type = 'finalise';
    }
  }
  if (!type || !config.types[type] || count(state.attempts?.[type]) + count(legacy.legacyCounts[type]) >= TYPES[type].limit) return null;
  return { type, label: TYPES[type].label };
}
module.exports = { HOUR, DAY, TYPES, millis, normaliseEmail, londonDay, sendingHours, settings, baseEligible, nextAction, legacyState };
