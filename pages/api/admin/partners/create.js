import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import {
  buildPartnerCreationRecord,
  savePartnerRecord,
  sendPartnerOwnerEmail,
} from '@/lib/partners/partnerCreation';
import { DEFAULT_PARTNER_BRAND_COLOR } from '@/lib/partners/constants';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    venueName,
    contactName,
    contactEmail,
    logoUrl,
    venuePhotoUrl,
    venuePhotos = [],
    brandColor = DEFAULT_PARTNER_BRAND_COLOR,
    city,
    fullAddress,
    bookingUrl,
    venuePitch,
    allowedMealTags,
    sendOwnerEmail = false,
  } = req.body || {};

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const adminEmail = decoded?.email || decoded?.userEmail || '';
    if (!isAdminEmail(adminEmail)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const safeContactEmail = (contactEmail || adminEmail || '').trim().toLowerCase();
    const safeContactName = contactName || 'Admin';

    const { ref, slug, payload } = await buildPartnerCreationRecord(
      {
        venueName,
        contactName: safeContactName,
        contactEmail: safeContactEmail,
        logoUrl,
        venuePhotoUrl,
        venuePhotos,
        brandColor,
        city,
        fullAddress,
        bookingUrl,
        venuePitch,
        allowedMealTags,
      },
      { metadata: { createdByAdmin: true, createdByEmail: adminEmail } }
    );

    await savePartnerRecord({ ref, payload });

    if (sendOwnerEmail) {
      try {
        await sendPartnerOwnerEmail(payload);
      } catch (emailErr) {
        console.error('Admin partner email send failed', emailErr);
      }
    }

    return res.status(201).json({ slug, partner: payload });
  } catch (error) {
    console.error('admin partner create failed', error);
    const status = error?.statusCode || 400;
    return res.status(status).json({
      error: error?.message || 'Unable to create partner as admin.',
    });
  }
}
