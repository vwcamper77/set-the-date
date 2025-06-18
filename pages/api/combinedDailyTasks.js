import checkVotesAndNotifyOrganiser from './checkVotesAndNotifyOrganiser';
import pollClosedTakeActionReminder from './pollClosedTakeActionReminder';

export default async function handler(req, res) {
  // 📬 Use a custom header since Vercel strips 'Authorization' in production
  const auth = req.headers['x-authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn('🚫 Cron auth failed:', auth);
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
