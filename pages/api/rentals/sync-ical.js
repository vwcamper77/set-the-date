import { db, FieldValue } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { parseIcalToBlockedRanges } from '@/lib/rentals/ical';

const TIMEOUT_MS = 10000;
const MAX_RETRIES = 1;

const normalizeIcalUrl = (value) => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('webcal://')) {
    return `https://${trimmed.slice('webcal://'.length)}`;
  }
  return trimmed;
};

const fetchWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const fetchIcalWithRetry = async (url) => {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, TIMEOUT_MS);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const shortErrorMessage = (error) => {
  if (!error) return 'Sync failed.';
  const message = error.message || String(error);
  return message.length > 140 ? `${message.slice(0, 137)}...` : message;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const user = await verifyRequestFirebaseUser(req);
    const propertyId = typeof req.query?.propertyId === 'string' ? req.query.propertyId : null;
    if (!propertyId) {
      res.status(400).json({ error: 'Missing propertyId' });
      return;
    }

    const ownerSnap = await db.collection('rentalsOwners').doc(user.uid).get();
    if (!ownerSnap.exists) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    const propertyRef = db.collection('rentalsProperties').doc(propertyId);
    const propertySnap = await propertyRef.get();
    if (!propertySnap.exists) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }

    const property = propertySnap.data();
    if (property?.ownerId !== user.uid) {
      res.status(403).json({ error: 'Not authorized for this property' });
      return;
    }

    const icalUrl = normalizeIcalUrl(property?.icalUrl);
    if (!icalUrl) {
      res.status(400).json({ error: 'Missing iCal URL' });
      return;
    }

    try {
      const icalText = await fetchIcalWithRetry(icalUrl);
      const blockedRanges = parseIcalToBlockedRanges(icalText, { monthsAhead: 18 });

      await propertyRef.set(
        {
          blockedRanges,
          icalLastSyncedAt: FieldValue.serverTimestamp(),
          icalSyncStatus: 'ok',
          icalErrorMessage: '',
        },
        { merge: true }
      );

      const updatedSnap = await propertyRef.get();
      res.status(200).json({ property: { id: updatedSnap.id, ...updatedSnap.data() } });
    } catch (error) {
      await propertyRef.set(
        {
          icalSyncStatus: 'error',
          icalErrorMessage: shortErrorMessage(error),
        },
        { merge: true }
      );
      res.status(500).json({ error: shortErrorMessage(error) });
    }
  } catch (error) {
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error?.message || 'Unable to sync calendar' });
  }
}
