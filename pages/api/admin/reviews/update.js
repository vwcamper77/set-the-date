import { db, FieldValue } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';

const VISIBILITY_OPTIONS = new Set(['public', 'private']);
const CONSENT_OPTIONS = new Set(['yes', 'no', 'pending']);
const MODERATION_OPTIONS = new Set(['approved', 'pending', 'hidden', 'deleted']);

const derivePublicDisplay = (consent, visibility, moderationStatus) =>
  consent === 'yes' && visibility === 'public' && moderationStatus === 'approved';

const normalizeConsent = (value, fallback) => {
  if (CONSENT_OPTIONS.has(value)) return value;
  return fallback;
};

const normalizeVisibility = (value, fallback) => {
  if (VISIBILITY_OPTIONS.has(value)) return value;
  return fallback;
};

const normalizeModeration = (value, fallback) => {
  if (MODERATION_OPTIONS.has(value)) return value;
  return fallback;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const adminEmail = decoded?.email || decoded?.userEmail || '';
    if (!isAdminEmail(adminEmail)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { reviewId, publicConsent, visibility, moderationStatus } = req.body || {};
    if (!reviewId) {
      return res.status(400).json({ error: 'Missing reviewId' });
    }

    const reviewRef = db.collection('reviews').doc(reviewId);
    const reviewSnap = await reviewRef.get();
    if (!reviewSnap.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const current = reviewSnap.data() || {};
    const currentConsent =
      current.publicConsent || (current.consentPublic ? 'yes' : 'pending');
    const currentVisibility =
      current.visibility || (current.consentPublic ? 'public' : 'private');
    const currentModeration =
      current.moderationStatus || (current.consentPublic ? 'approved' : 'pending');

    const nextConsent = normalizeConsent(publicConsent, currentConsent);
    const nextVisibility = normalizeVisibility(visibility, currentVisibility);
    const nextModeration = normalizeModeration(moderationStatus, currentModeration);

    if (visibility === 'public' && nextConsent !== 'yes') {
      return res.status(400).json({ error: 'Public visibility requires consent.' });
    }

    const hasConsentUpdate = CONSENT_OPTIONS.has(publicConsent);
    const hasVisibilityUpdate = VISIBILITY_OPTIONS.has(visibility);
    const hasModerationUpdate = MODERATION_OPTIONS.has(moderationStatus);

    if (!hasConsentUpdate && !hasVisibilityUpdate && !hasModerationUpdate) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    const updates = {
      publicConsent: nextConsent,
      consentPublic: nextConsent === 'yes',
    };
    if (hasVisibilityUpdate) {
      updates.visibility = nextVisibility;
    }
    if (hasModerationUpdate) {
      updates.moderationStatus = nextModeration;
      if (nextModeration === 'deleted') {
        updates.deletedAt = FieldValue.serverTimestamp();
      }
    }

    updates.publicDisplay = derivePublicDisplay(nextConsent, nextVisibility, nextModeration);
    updates.updatedAt = FieldValue.serverTimestamp();

    await reviewRef.update(updates);

    return res.status(200).json({ ok: true, reviewId });
  } catch (error) {
    console.error('admin reviews update failed', error);
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: error?.message || 'Unable to update review' });
  }
}
