import crypto from 'node:crypto';
import { helpers, isHelpersProduction } from '@/lib/organiserHelpers/server';
export const config = { maxDuration: 300 };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CRON_SECRET;
  const header = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || header.length !== expected.length || !crypto.timingSafeEqual(header, expected)) return res.status(401).json({ error: 'Unauthorised' });
  if (!isHelpersProduction()) return res.status(403).json({ error: 'Production only' });
  try { const result = await helpers.runScheduled(); return res.status(result.failed || result.uncertain ? 502 : 200).json(result); }
  catch { return res.status(500).json({ error: 'Helper run failed; check the admin delivery history before retrying.' }); }
}
