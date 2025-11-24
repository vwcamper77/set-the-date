import { db, FieldValue } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { normalizePartnerRecord } from '@/lib/partners/emailTemplates';
import { normalizeFeaturedEvents } from '@/lib/partners/featuredEvents';
import { normaliseEmail } from '@/lib/organiserService';
import { isAdminEmail } from '@/lib/adminUsers';
import { DEFAULT_PARTNER_MEAL_TAG_IDS, PARTNER_MEAL_TAGS } from '@/lib/partners/constants';

const HEX_REGEX = /^#(?:[0-9a-f]{3}){1,2}$/i;

const VALID_MEAL_TAGS = new Set(PARTNER_MEAL_TAGS.map((tag) => tag.id));

const normalizeMealTags = (allowedMealTags) => {
  const fallback = [...DEFAULT_PARTNER_MEAL_TAG_IDS];
  if (!Array.isArray(allowedMealTags)) {
    return fallback;
  }
  const cleaned = Array.from(
    new Set(
      allowedMealTags
        .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
        .filter((tag) => tag && VALID_MEAL_TAGS.has(tag))
    )
  );
  return cleaned.length ? cleaned.slice(0, fallback.length) : fallback;
};

const ensureHex = (value) => {
  if (!value) return '#0f172a';
  const trimmed = value.trim();
  if (!HEX_REGEX.test(trimmed)) {
    throw new Error('Invalid brand color. Use a hex value like #0f172a.');
  }
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
};

const validateUrl = (value, field) => {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Unsupported protocol');
    }
    return url.toString();
  } catch (error) {
    throw new Error(`Invalid ${field}`);
  }
};

const clampText = (value, max = 240) => {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
};

const clampTemplateText = (value, max = 2000) => {
  const normalized = value === undefined || value === null ? '' : String(value);
  return normalized.length <= max ? normalized : normalized.slice(0, max);
};

const clampSubject = (value) => clampTemplateText(value, 200);
const clampBody = (value) => clampTemplateText(value, 4000);
const clampCampaign = (value) => clampTemplateText(value, 2500);

const sanitizeGallery = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(Boolean)
    .slice(0, 4)
    .map((url, index) => validateUrl(url, `gallery image #${index + 1}`));
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    slug,
    logoUrl,
    brandColor,
    venuePhotoUrl,
    venuePhotoGallery,
    venueName,
    city,
    fullAddress,
    bookingUrl,
    venuePitch,
    allowedMealTags,
    emailSubject,
    emailBody,
    emailCampaign,
    contactEmail: requestedContactEmail,
    contactName,
    phoneNumber,
    instagramUrl,
    facebookUrl,
    tiktokUrl,
    twitterUrl,
    featuredEvents,
  } = req.body || {};

  if (!slug) {
    return res.status(400).json({ error: 'Missing partner slug' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const requesterEmail = normaliseEmail(decoded.email || decoded.userEmail || '');
    if (!requesterEmail) {
      return res.status(401).json({ error: 'Your login is missing an email address.' });
    }
    const requesterIsAdmin = isAdminEmail(requesterEmail);

    const partnerRef = db.collection('partners').doc(slug);
    const snapshot = await partnerRef.get();

    if (!snapshot.exists) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    const partnerData = snapshot.data();
    const contactEmail = normaliseEmail(partnerData.contactEmail || '');
    if (!requesterIsAdmin && contactEmail && contactEmail !== requesterEmail) {
      return res.status(403).json({ error: 'You do not have permission to update this venue.' });
    }

    const payload = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (requestedContactEmail !== undefined) {
      if (!requesterIsAdmin) {
        return res.status(403).json({ error: 'Only admins can change the contact email.' });
      }
      const normalized = normaliseEmail(requestedContactEmail);
      if (!normalized) {
        throw new Error('Invalid contact email');
      }
      payload.contactEmail = normalized;
    }

    if (contactName !== undefined) {
      if (!requesterIsAdmin && contactEmail && contactEmail !== requesterEmail) {
        return res.status(403).json({ error: 'Only admins can change the contact name.' });
      }
      payload.contactName = clampText(contactName, 120);
    }

    if (logoUrl !== undefined) {
      payload.logoUrl = logoUrl ? validateUrl(logoUrl, 'logo URL') : '';
    }

    let galleryPayload;
    if (venuePhotoGallery !== undefined) {
      if (!Array.isArray(venuePhotoGallery)) {
        throw new Error('Gallery must be an array of URLs.');
      }
      galleryPayload = sanitizeGallery(venuePhotoGallery);
      payload.venuePhotoGallery = galleryPayload;
    }

    if (venuePhotoUrl !== undefined) {
      payload.venuePhotoUrl = venuePhotoUrl ? validateUrl(venuePhotoUrl, 'hero image URL') : '';
    } else if (galleryPayload?.length) {
      payload.venuePhotoUrl = galleryPayload[0];
    }

    if (brandColor !== undefined) {
      payload.brandColor = ensureHex(brandColor);
    }

    if (venueName !== undefined) {
      payload.venueName = clampText(venueName, 120);
    }

    if (city !== undefined) {
      payload.city = clampText(city, 80);
    }

    if (fullAddress !== undefined) {
      payload.fullAddress = clampText(fullAddress, 240);
    }

    if (venuePitch !== undefined) {
      payload.venuePitch = clampText(venuePitch, 800);
    }

    if (allowedMealTags !== undefined) {
      payload.allowedMealTags = normalizeMealTags(allowedMealTags);
    }

    if (bookingUrl !== undefined) {
      payload.bookingUrl = bookingUrl ? validateUrl(bookingUrl, 'booking URL') : '';
    }

    if (phoneNumber !== undefined) {
      payload.phoneNumber = clampText(phoneNumber, 64);
    }

    if (instagramUrl !== undefined) {
      payload.instagramUrl = instagramUrl ? validateUrl(instagramUrl, 'Instagram URL') : '';
    }

    if (facebookUrl !== undefined) {
      payload.facebookUrl = facebookUrl ? validateUrl(facebookUrl, 'Facebook URL') : '';
    }

    if (tiktokUrl !== undefined) {
      payload.tiktokUrl = tiktokUrl ? validateUrl(tiktokUrl, 'TikTok URL') : '';
    }

    if (twitterUrl !== undefined) {
      payload.twitterUrl = twitterUrl ? validateUrl(twitterUrl, 'Twitter URL') : '';
    }

    if (featuredEvents !== undefined) {
      if (!Array.isArray(featuredEvents)) {
        throw new Error('Featured events must be an array.');
      }
      payload.featuredEvents = normalizeFeaturedEvents(featuredEvents);
    }

    if (emailSubject !== undefined) {
      const clamped = clampSubject(emailSubject);
      payload.customEmailSubject = clamped ? clamped : FieldValue.delete();
    }

    if (emailBody !== undefined) {
      const clamped = clampBody(emailBody);
      payload.customEmailBody = clamped ? clamped : FieldValue.delete();
    }

    if (emailCampaign !== undefined) {
      const clamped = clampCampaign(emailCampaign);
      payload.customEmailCampaign = clamped ? clamped : FieldValue.delete();
    }

    await partnerRef.set(payload, { merge: true });
    const updatedSnapshot = await partnerRef.get();
    const partner = normalizePartnerRecord(updatedSnapshot.data(), slug);

    return res.status(200).json({ partner });
  } catch (error) {
    const status = error?.statusCode === 401 ? 401 : 400;
    console.error('partner asset update failed', error);
    return res.status(status).json({
      error: error?.message || 'Unable to update partner settings.',
    });
  }
}
