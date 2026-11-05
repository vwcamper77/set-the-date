import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import { helpers, isHelpersProduction } from '@/lib/organiserHelpers/server';

const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(value);
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  try {
    const user = await verifyRequestFirebaseUser(req);
    if (!user.email_verified || !isAdminEmail(user.email)) return res.status(403).json({ error: 'Admin access required' });
    if (req.method === 'GET') {
      if (req.query.cursor && !validId(req.query.cursor)) return res.status(400).json({ error: 'Invalid cursor' });
      return res.status(200).json({ ...await helpers.preview(req.query.cursor), production: isHelpersProduction(), configured: !!process.env.CRON_SECRET && !!process.env.BREVO_API_KEY });
    }
    if (!isHelpersProduction()) return res.status(403).json({ error: 'Settings can only be changed on the production site.' });
    const { action, pollId, paused } = req.body || {};
    if (action === 'settings') {
      if (req.body.enabled && (!process.env.CRON_SECRET || !process.env.BREVO_API_KEY)) return res.status(409).json({ error: 'Connect the scheduler and email provider first.' });
      return res.status(200).json(await helpers.saveSettings(req.body));
    }
    if (!validId(pollId)) return res.status(400).json({ error: 'Invalid event' });
    if (action === 'pause' && typeof paused === 'boolean') await helpers.pauseEvent(pollId, paused);
    else if (action === 'dismiss') await helpers.dismissAttempt(pollId);
    else return res.status(400).json({ error: 'Invalid action' });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Organiser helpers request failed', error.statusCode || 'request');
    return res.status(error.statusCode || 400).json({ error: error.statusCode === 401 ? 'Sign in again.' : error.message || 'Unable to update organiser helpers.' });
  }
}
