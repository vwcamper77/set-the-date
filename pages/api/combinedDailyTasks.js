import checkVotesAndNotifyOrganiser from './checkVotesAndNotifyOrganiser';
import pollClosedTakeActionReminder from './pollClosedTakeActionReminder';

export default async function handler(req, res) {
  // Ensure it's triggered by Vercel cron
  if (!req.headers['x-vercel-cron']) {
    return res.status(401).end('Unauthorized');
  }

  // Run internal handlers directly
  try {
    await checkVotesAndNotifyOrganiser(req, res);
  } catch (err) {
    console.error('❌ Error in checkVotesAndNotifyOrganiser:', err);
  }

  try {
    await pollClosedTakeActionReminder(req, res);
  } catch (err) {
    console.error('❌ Error in pollClosedTakeActionReminder:', err);
  }

  return res.status(200).end('✅ Daily reminders sent');
}
