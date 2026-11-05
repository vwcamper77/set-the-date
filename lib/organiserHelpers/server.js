import { db } from '@/lib/firebaseAdmin';
import { createHelpers } from './service.cjs';
import { legacyState } from './policy.cjs';

export const isHelpersProduction = () => process.env.VERCEL_ENV === 'production';
export const helpers = createHelpers({ db, sendEmail: async payload => {
  if (!isHelpersProduction() || !process.env.BREVO_API_KEY) { const error = new Error('Email is not configured for production.'); error.definite = true; throw error; }
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) { const error = new Error('Email provider rejected request.'); error.definite = response.status >= 400 && response.status < 500 && response.status !== 408; throw error; }
} });

// Old deployed Cloud Functions may still call these routes. Retire their sends
// permanently once the new scheduler takes ownership, including while paused.
export async function legacyHelpersRetired(req, res) {
  if (!isHelpersProduction()) {
    res.status(403).json({ message: 'Reminder sends are production only.' });
    return true;
  }
  const config = (await db.collection('organiserHelperSettings').doc('config').get()).data();
  if (!config?.activatedAt) return false;
  const pollId = req.body?.pollId;
  if (typeof pollId === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(pollId)) {
    await db.runTransaction(async transaction => {
      const ref = db.collection('organiserHelperEvents').doc(pollId);
      const state = (await transaction.get(ref)).data() || {};
      const poll = await transaction.get(db.collection('polls').doc(pollId));
      // Snapshot the old counters before an older deployed worker updates them
      // despite the non-success HTTP response. Preserve them through cutover.
      if (poll.exists && !state.legacyCounts) transaction.set(ref, { ...state, ...legacyState(poll.data()) });
    });
  }
  res.status(409).json({ message: 'Organiser helpers now manage reminders.' });
  return true;
}
