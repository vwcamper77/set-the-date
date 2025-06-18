import checkVotesAndNotifyOrganiser from './checkVotesAndNotifyOrganiser';
import pollClosedTakeActionReminder from './pollClosedTakeActionReminder';

export default async function handler(req, res) {
  // Only Vercel cron jobs hit this endpoint
  await checkVotesAndNotifyOrganiser(req, res);
  await pollClosedTakeActionReminder(req, res);
  res.status(200).end('✅ Daily reminders sent');
}
