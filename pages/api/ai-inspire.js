const AI_SERVICE_BASE =
  process.env.AI_INSPIRE_SERVICE_URL ||
  process.env.AI_SERVICE_URL ||
  'http://localhost:8000';

/**
 * Proxy route between the web app and the Python AI inspire microservice.
 * All browser calls should hit this endpoint, never the Python service directly.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST supported' });
  }

  const { groupSize, location, dateRange, vibe, eventType, ...rest } = req.body || {};
  const required = { groupSize, location, dateRange, vibe, eventType };
  const missing = Object.entries(required).find(([_, value]) => value === undefined || value === null);
  if (missing) {
    return res.status(400).json({ message: `Missing required field: ${missing[0]}` });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${AI_SERVICE_BASE.replace(/\/$/, '')}/suggest-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupSize, location, dateRange, vibe, eventType, ...rest }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error('AI Inspire service error', response.status);
      return res
        .status(503)
        .json({ message: 'Our AI helper is having a moment. Try again in a bit or pick a venue yourself.' });
    }

    const payload = await response.json();
    return res.status(200).json(payload);
  } catch (error) {
    clearTimeout(timeout);
    console.error('AI Inspire proxy failed', error);
    return res
      .status(503)
      .json({ message: 'Our AI helper is having a moment. Try again in a bit or pick a venue yourself.' });
  }
}
