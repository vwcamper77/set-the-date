import { db, FieldValue } from '@/lib/firebaseAdmin';
import { buildPartnerOwnerEmail } from '@/lib/partners/emailTemplates';
import { findOnboardingByToken, markOnboardingComplete } from '@/lib/partners/onboardingService';

const HEX_REGEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/i;

const slugify = (value = '') => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'partner';
};

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
  if (!value) return '#0f172a';
  const trimmed = value.trim();
  if (!HEX_REGEX.test(trimmed)) {
    throw new Error('Invalid brand color');
  }
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
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

const sendOwnerEmail = async (partner) => {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const {
    venueName,
    contactName,
    contactEmail,
    logoUrl,
    venuePhotoUrl,
    venuePhotos = [],
    brandColor,
    city,
    fullAddress,
    bookingUrl,
    venuePitch,
    allowedMealTags,
    onboardingToken,
  } = req.body || {};

  if (!onboardingToken) {
    return res.status(401).json({ message: 'Missing onboarding token' });
  }

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
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const onboardingRecord = await findOnboardingByToken(onboardingToken);
    if (!onboardingRecord) {
      return res.status(403).json({ message: 'Invalid or expired partner access token' });
    }
    if (onboardingRecord.data?.partnerId) {
      return res.status(409).json({ message: 'Partner already created for this session' });
    }

    const trimmedVenue = String(venueName).trim();
    const trimmedContact = String(contactName).trim();
    const trimmedEmail = String(contactEmail).trim().toLowerCase();
    const trimmedCity = String(city).trim();
    const trimmedAddress = String(fullAddress).trim();
    const safeLogoUrl = validateUrl(logoUrl, 'logo URL');
    const safeGallery =
      Array.isArray(venuePhotos) && venuePhotos.length
        ? venuePhotos
            .filter(Boolean)
            .slice(0, 3)
            .map((url, idx) => validateUrl(url, `venue photo URL #${idx + 1}`))
        : [];
    const safePhotoUrl =
      safeGallery[0] || (venuePhotoUrl ? validateUrl(venuePhotoUrl, 'venue photo URL') : '');
    const safeBookingUrl = bookingUrl ? validateUrl(bookingUrl, 'booking URL') : '';
    const safeColor = ensureHex(brandColor);
    const pitch = String(venuePitch).trim();
    const safeMealTags = Array.isArray(allowedMealTags) && allowedMealTags.length
      ? allowedMealTags.filter((tag) => typeof tag === 'string' && tag.length <= 30)
      : ['breakfast', 'brunch', 'coffee', 'lunch', 'lunch_drinks', 'afternoon_tea', 'dinner', 'evening'];

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
      venuePhotoUrl: safePhotoUrl,
      venuePhotoGallery: safeGallery,
      venuePitch: pitch,
      allowedMealTags: safeMealTags,
      city: trimmedCity,
      fullAddress: trimmedAddress,
      bookingUrl: safeBookingUrl,
      createdAt: FieldValue.serverTimestamp(),
      status: 'active',
    };

    await ref.set(payload);

    try {
      await markOnboardingComplete({ token: onboardingToken, partnerId: slug, slug });
    } catch (markErr) {
      console.error('partner onboarding update failed', markErr);
    }

    try {
      await sendOwnerEmail(payload);
    } catch (emailErr) {
      console.error('partner email failed', emailErr);
    }

    return res.status(201).json({ slug });
  } catch (error) {
    console.error('partner create failed', error);
    return res.status(400).json({ message: error.message || 'Unable to create partner' });
  }
}

