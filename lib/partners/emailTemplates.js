import { normalizeFeaturedEvents } from '@/lib/partners/featuredEvents';

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : 'https://plan.setthedate.app');
const STD_LOGO = `${BASE_URL}/images/setthedate-logo.png`;

export const buildPartnerLinks = (partner) => {
  const venue = partner?.venueName || 'your venue';
  const city = partner?.city ? `, ${partner.city}` : '';
  const encodedLocation = encodeURIComponent(`${venue}${city}`.trim());
  const slug = partner?.slug;
  const sharePath = slug ? `/p/${slug}` : '/';
  const shareUrl = `${BASE_URL}${sharePath}`;
  const relativeCreatePath = `/?partner=${slug}&prefillLocation=${encodedLocation}`;
  const createUrl = `${BASE_URL}${relativeCreatePath}`;
  return { shareUrl, sharePath, createUrl, relativeCreatePath, encodedLocation };
};

export const buildCampaignText = (partner) => {
  const venue = partner?.venueName || 'our venue';
  const city = partner?.city ? ` in ${partner.city}` : '';
  const { shareUrl } = buildPartnerLinks(partner);
  const bookingUrl = partner?.bookingUrl || `${BASE_URL}/venues`;
  const ps = `P.S. Already know your date and ready to book a table now? ${bookingUrl}`;

  return [
    'Planning birthday drinks, work socials or a night out with friends?',
    `Use our ${venue}${city} date poll to get your group organised. Pick a few dates, share a link, and let everyone vote Best / Maybe / No. No logins needed.`,
    '',
    `Start here: ${shareUrl}`,
    '',
    ps,
  ].join('\n');
};

export const buildPartnerOwnerEmail = (partner) => {
  const venue = partner?.venueName || 'your venue';
  const contact = partner?.contactName || 'there';
  const slug = partner?.slug || '';
  const { shareUrl, createUrl } = buildPartnerLinks(partner);
  const campaignText = buildCampaignText(partner);
  const subject = `Invite your customers to set the date at ${venue}`;
  const bookingLine = partner?.bookingUrl
    ? `P.S. Include your booking link (${partner.bookingUrl}) to lock tables fast.`
    : "P.S. Add a short note telling guests how to reserve once they pick a date.";

  const htmlContent = `
    <div style="font-family: 'Inter', Arial, sans-serif; background-color: #ffffff; color: #0f172a; padding: 24px; border-radius: 24px; border: 1px solid #e2e8f0;">
      <div style="text-align:center; margin-bottom: 24px;">
        <img src="${STD_LOGO}" alt="Set The Date" width="160" style="border-radius: 16px;" />
      </div>
      <p>Hi ${contact},</p>
      <p>Welcome to the Set The Date partner flow. Your guests can now land on a ${venue} share page and jump straight into planning.</p>
      <div style="margin: 24px 0; display:flex; gap:12px; flex-wrap:wrap;">
        <a href="${shareUrl}" style="flex:1; min-width:220px; background:#0f172a; color:#ffffff; text-decoration:none; padding:14px 18px; border-radius:999px; text-align:center; font-weight:600;">View your venue share page</a>
        <a href="${createUrl}" style="flex:1; min-width:220px; border:1px solid #0f172a; color:#0f172a; text-decoration:none; padding:14px 18px; border-radius:999px; text-align:center; font-weight:600;">Open Set The Date</a>
      </div>
      <p>Copy this campaign email into the ESP you already use and send it to your list:</p>
      <pre style="white-space:pre-wrap; background:#f1f5f9; color:#0f172a; padding:16px; border-radius:16px; font-size:14px; line-height:1.6;">${campaignText}</pre>
      <p>${bookingLine}</p>
      <p style="margin-top:24px;">Need edits? Reply to this email and we can tweak the copy or color anytime.</p>
      <p style="margin-top:24px;">- Gavin<br/>Founder, Set The Date</p>
    </div>
  `;

  const textContent = `Hi ${contact},\n\nYour Set The Date partner page is live.\n\nView it: ${shareUrl}\nOpen Set The Date: ${createUrl}\n\nPaste this campaign copy into your ESP:\n${campaignText}\n\n${bookingLine}\n\n- Gavin, Set The Date`;

  return { subject, htmlContent, textContent, campaignText, slug };
};

const toIsoDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (typeof value.toMillis === 'function') {
    return new Date(value.toMillis()).toISOString();
  }
  if (value?.seconds) {
    return new Date(value.seconds * 1000).toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const normalizePartnerRecord = (partner, slug) => {
  if (!partner) return null;
  const normalised = { ...partner, slug };
  normalised.featuredEvents = normalizeFeaturedEvents(partner.featuredEvents || []);
  ['createdAt', 'updatedAt', 'publishedAt', 'lastEditedAt'].forEach((field) => {
    normalised[field] = toIsoDate(partner[field]);
  });
  return normalised;
};
