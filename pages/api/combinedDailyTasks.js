import checkVotesAndNotifyOrganiser from './checkVotesAndNotifyOrganiser';
import pollClosedTakeActionReminder from './pollClosedTakeActionReminder';

export default async function handler(req, res) {
  // Validate using a custom header since Authorization gets stripped
  const auth = req.headers['x-authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

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

  res.status(200).end('✅ Daily reminders sent');
}
