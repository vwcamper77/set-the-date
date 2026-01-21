const fetch = require('node-fetch');
const { db, FieldValue } = require('../lib/firebase');
const { parseIcalToBlockedRanges } = require('../lib/ical');

const TIMEOUT_MS = 10000;
const MAX_RETRIES = 1;
const MONTHS_AHEAD = 18;

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

module.exports = async function syncRentalsIcalTask() {
  console.log('Running syncRentalsIcalTask...');

  try {
    const propertiesSnap = await db
      .collection('rentalsProperties')
      .where('active', '==', true)
      .get();

    for (const propertyDoc of propertiesSnap.docs) {
      const property = propertyDoc.data();
      const icalUrl = normalizeIcalUrl(property?.icalUrl);
      if (!icalUrl) {
        continue;
      }

      try {
        const icalText = await fetchIcalWithRetry(icalUrl);
        const blockedRanges = parseIcalToBlockedRanges(icalText, { monthsAhead: MONTHS_AHEAD });

        await propertyDoc.ref.set(
          {
            blockedRanges,
            icalLastSyncedAt: FieldValue.serverTimestamp(),
            icalSyncStatus: 'ok',
            icalErrorMessage: '',
          },
          { merge: true }
        );
        console.log(`Synced iCal for ${propertyDoc.id} (${blockedRanges.length} ranges).`);
      } catch (error) {
        console.error(`iCal sync failed for ${propertyDoc.id}`, error);
        await propertyDoc.ref.set(
          {
            icalSyncStatus: 'error',
            icalErrorMessage: shortErrorMessage(error),
          },
          { merge: true }
        );
      }
    }
  } catch (error) {
    console.error('syncRentalsIcalTask failed', error);
  }
};
