import checkVotesAndNotifyOrganiser from './checkVotesAndNotifyOrganiser';
import pollClosedTakeActionReminder from './pollClosedTakeActionReminder';

export default async function handler(req, res) {
  // ✅ Only allow scheduled Vercel cron jobs
  const isCron = req.headers['x-vercel-cron'] === '1';
  if (!isCron) {
    console.warn('🚫 Not a scheduled cron request');
    return res.status(401).end('Unauthorized');
  }

  try {
    await checkVotesAndNotifyOrganiser(req, res);
  } catch (err) {
    console.error('❌ checkVotesAndNotifyOrganiser error:', err);
  }

  try {
    await pollClosedTakeActionReminder(req, res);
  } catch (err) {
    console.error('❌ pollClosedTakeActionReminder error:', err);
  }

  res.status(200).end('✅ Daily reminders sent');
}
