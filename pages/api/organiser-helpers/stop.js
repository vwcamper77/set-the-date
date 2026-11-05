import { helpers, isHelpersProduction } from '@/lib/organiserHelpers/server';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isHelpersProduction()) return res.status(403).json({ error: 'Use the link in your email on the live site.' });
  const { pollId, token } = req.body || {};
  if (typeof pollId !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(pollId) || typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) return res.status(400).json({ error: 'Invalid reminder link.' });
  try { await helpers.stop(pollId, token); return res.status(200).json({ ok: true }); }
  catch (error) { return res.status(error.statusCode || 500).json({ error: 'Unable to stop reminders. Check your email link or contact hello@setthedate.app.' }); }
}
