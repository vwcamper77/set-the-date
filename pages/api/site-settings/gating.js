import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import { getGatingDocRef, normalizeGatingConfig } from '@/lib/siteSettings';

const METHOD_NOT_ALLOWED = 'Method not allowed';

const parseBody = (body) => {
  if (!body || typeof body !== 'object') return {};
  return body;
};

export default async function handler(req, res) {
  try {
    const decodedToken = await verifyRequestFirebaseUser(req);
    if (!isAdminEmail(decodedToken?.email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const docRef = getGatingDocRef();

    if (req.method === 'GET') {
      const snapshot = await docRef.get();
      const payload = normalizeGatingConfig(snapshot.exists ? snapshot.data() : {});
      return res.status(200).json(payload);
    }

    if (req.method === 'POST') {
      const payload = normalizeGatingConfig(parseBody(req.body));
      await docRef.set(payload, { merge: true });
      return res.status(200).json(payload);
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: METHOD_NOT_ALLOWED });
  } catch (error) {
    console.error('Site settings gating API error', error);
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: error?.message || 'Unable to process request' });
  }
}
