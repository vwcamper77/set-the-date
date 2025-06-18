import checkVotesAndNotifyOrganiser from './checkVotesAndNotifyOrganiser';
import pollClosedTakeActionReminder from './pollClosedTakeActionReminder';

export default async function handler(req, res) {
  // Ensure this comes from a valid cron trigger (as needed)
  if (req.headers['x-vercel-cron'] !== 'true') {
    return res.status(401).end('Unauthorized');
  }

  // Build baseUrl dynamically on Vercel
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  console.log('📡 combinedDailyTasks running, baseUrl:', baseUrl);

  // Inject baseUrl into the request for downstream functions
  const enrichedReq = {
    ...req,
    baseUrl,
    cron: true, // optional flag to indicate cron invocation
  };

  try {
    await checkVotesAndNotifyOrganiser(enrichedReq, res);
  } catch (err) {
    console.error('❌ Error in checkVotesAndNotifyOrganiser:', err);
  }

  try {
    await pollClosedTakeActionReminder(enrichedReq, res);
  } catch (err) {
    console.error('❌ Error in pollClosedTakeActionReminder:', err);
  }

  res.status(200).end('✅ Daily reminders sent');
}
