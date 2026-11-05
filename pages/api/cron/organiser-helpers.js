import crypto from 'node:crypto';
import { helpers, isHelpersProduction } from '@/lib/organiserHelpers/server';
export const config = { maxDuration: 300 };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.ORGANISER_HELPERS_SECRET;
  const header = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || header.length !== expected.length || !crypto.timingSafeEqual(header, expected)) return res.status(401).json({ error: 'Unauthorised' });
  if (!isHelpersProduction()) return res.status(403).json({ error: 'Production only' });
  const cursor = req.body?.cursor;
  if (cursor && (typeof cursor !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(cursor))) return res.status(400).json({ error: 'Invalid cursor' });
  try { return res.status(200).json(await helpers.run(cursor)); }
  catch { return res.status(500).json({ error: 'Helper run failed; check the admin delivery history before retrying.' }); }
}
