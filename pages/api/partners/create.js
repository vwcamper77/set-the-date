import { findOnboardingByToken, markOnboardingComplete } from '@/lib/partners/onboardingService';
import {
  buildPartnerCreationRecord,
  savePartnerRecord,
  sendPartnerOwnerEmail,
} from '@/lib/partners/partnerCreation';

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
    phoneNumber,
    instagramUrl,
    facebookUrl,
    tiktokUrl,
    twitterUrl,
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
    const expectedEmail = String(onboardingRecord.data?.customerEmail || '').trim().toLowerCase();
    if (expectedEmail && trimmedEmail !== expectedEmail) {
      return res.status(403).json({
        message: 'Contact email must match your venue partner account.',
      });
    }

    const { ref, slug, payload } = await buildPartnerCreationRecord({
      venueName: trimmedVenue,
      contactName: trimmedContact,
      contactEmail: trimmedEmail,
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
    });

    await savePartnerRecord({ ref, payload });

    try {
      await markOnboardingComplete({ token: onboardingToken, partnerId: slug, slug });
    } catch (markErr) {
      console.error('partner onboarding update failed', markErr);
    }

    try {
      await sendPartnerOwnerEmail(payload);
    } catch (emailErr) {
      console.error('partner email failed', emailErr);
    }

    return res.status(201).json({ slug });
  } catch (error) {
    console.error('partner create failed', error);
    return res.status(400).json({ message: error.message || 'Unable to create partner' });
  }
}

