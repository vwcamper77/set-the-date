import { db, FieldValue } from '@/lib/firebaseAdmin';
import { buildPartnerOwnerEmail } from '@/lib/partners/emailTemplates';
import {
  DEFAULT_PARTNER_BRAND_COLOR,
  DEFAULT_PARTNER_MEAL_TAG_IDS,
  MAX_PARTNER_GALLERY_PHOTOS,
} from '@/lib/partners/constants';

const HEX_REGEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/i;

const slugify = (value = '') =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'partner';

const validateUrl = (value, field) => {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('invalid protocol');
    }
    return url.toString();
  } catch (err) {
    throw new Error(`Invalid ${field}`);
  }
};

const ensureHex = (value) => {
  if (!value) return DEFAULT_PARTNER_BRAND_COLOR;
  const trimmed = value.trim();
  if (!HEX_REGEX.test(trimmed.startsWith('#') ? trimmed : `#${trimmed}`)) {
    throw new Error('Invalid brand color');
  }
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
};

const normalizeMealTags = (allowedMealTags) => {
  if (!Array.isArray(allowedMealTags) || !allowedMealTags.length) {
    return [...DEFAULT_PARTNER_MEAL_TAG_IDS];
  }
  const deduped = Array.from(
    new Set(
      allowedMealTags
        .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
        .filter(Boolean)
    )
  );
  return deduped.length
    ? deduped.slice(0, DEFAULT_PARTNER_MEAL_TAG_IDS.length)
    : [...DEFAULT_PARTNER_MEAL_TAG_IDS];
};

const clampText = (value, max = 120) => {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
};

const optionalUrl = (value, field) => {
  if (!value) return '';
  return validateUrl(value, field);
};

const normalizeGallery = (venuePhotos = [], venuePhotoUrl = '') => {
  const cleaned = Array.isArray(venuePhotos)
    ? venuePhotos
        .filter(Boolean)
        .map((url, idx) => validateUrl(url, `venue photo URL #${idx + 1}`))
        .slice(0, MAX_PARTNER_GALLERY_PHOTOS)
    : [];
  if (!cleaned.length && venuePhotoUrl) {
    const safeHero = validateUrl(venuePhotoUrl, 'venue photo URL');
    return safeHero ? [safeHero] : [];
  }
  return cleaned;
};

const generateUniqueSlug = async (base) => {
  let attempt = 0;
  let candidate = base;
  while (attempt < 50) {
    const ref = db.collection('partners').doc(candidate);
    const snap = await ref.get();
    if (!snap.exists) {
      return { ref, slug: candidate };
    }
    attempt += 1;
    candidate = `${base}-${attempt + 1}`;
  }
  throw new Error('Unable to allocate unique slug');
};

const normalizeMetadata = (meta) => {
  if (!meta || typeof meta !== 'object') {
    return {};
  }
  return Object.entries(meta).reduce((acc, [key, value]) => {
    if (typeof value === 'undefined') return acc;
    acc[key] = value;
    return acc;
  }, {});
};

export const buildPartnerCreationRecord = async (input, { metadata } = {}) => {
  const {
    venueName,
    contactName,
    contactEmail,
    logoUrl,
    venuePhotoUrl,
    venuePhotos,
    brandColor,
    city,
    fullAddress,
    bookingUrl,
    venuePitch,
    allowedMealTags,
    phoneNumber,
    instagramUrl,
    facebookUrl,
    tiktokUrl,
    twitterUrl,
  } = input || {};

  if (
    !venueName ||
    !contactName ||
    !contactEmail ||
    !logoUrl ||
    !brandColor ||
    !city ||
    !venuePitch ||
    !fullAddress
  ) {
    throw new Error('Missing required partner fields');
  }

  const trimmedVenue = String(venueName).trim();
  const trimmedContact = String(contactName).trim();
  const trimmedEmail = String(contactEmail).trim().toLowerCase();
  const trimmedCity = String(city).trim();
  const trimmedAddress = String(fullAddress).trim();
  const safeLogoUrl = validateUrl(logoUrl, 'logo URL');
  const gallery = normalizeGallery(venuePhotos, venuePhotoUrl);
  const fallbackPhoto =
    gallery[0] || (venuePhotoUrl ? validateUrl(venuePhotoUrl, 'venue photo URL') : '');
  const safeBookingUrl = bookingUrl ? validateUrl(bookingUrl, 'booking URL') : '';
  const safeColor = ensureHex(brandColor);
  const safeMealTags = normalizeMealTags(allowedMealTags);
  const pitch = String(venuePitch).trim();

  const baseSlug = slugify(`${trimmedVenue}-${trimmedCity}`);
  const { ref, slug } = await generateUniqueSlug(baseSlug);

  const payload = {
    id: slug,
    slug,
    venueName: trimmedVenue,
    contactName: trimmedContact,
    contactEmail: trimmedEmail,
    brandColor: safeColor,
    logoUrl: safeLogoUrl,
    venuePhotoUrl: fallbackPhoto,
    venuePhotoGallery: gallery,
    venuePitch: pitch,
    allowedMealTags: safeMealTags,
    city: trimmedCity,
    fullAddress: trimmedAddress,
    bookingUrl: safeBookingUrl,
    phoneNumber: clampText(phoneNumber, 40),
    instagramUrl: optionalUrl(instagramUrl, 'Instagram URL'),
    facebookUrl: optionalUrl(facebookUrl, 'Facebook URL'),
    tiktokUrl: optionalUrl(tiktokUrl, 'TikTok URL'),
    twitterUrl: optionalUrl(twitterUrl, 'Twitter URL'),
    createdAt: FieldValue.serverTimestamp(),
    status: 'active',
    ...normalizeMetadata(metadata),
  };

  return { ref, slug, payload };
};

export const savePartnerRecord = async ({ ref, payload }) => {
  await ref.set(payload);
  return payload;
};

export const sendPartnerOwnerEmail = async (partner) => {
  const { subject, htmlContent, textContent } = buildPartnerOwnerEmail(partner);
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Set The Date', email: 'noreply@setthedate.app' },
      to: [{ email: partner.contactEmail, name: partner.contactName }],
      subject,
      htmlContent,
      textContent,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo send failed: ${response.status} ${detail}`);
  }
};
