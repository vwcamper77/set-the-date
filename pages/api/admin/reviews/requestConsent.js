import { db, FieldValue } from '@/lib/firebaseAdmin';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import { sendBrevoEmail } from '@/lib/brevo';

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildConsentEmail = ({ name, eventTitle }) => {
  const greeting = name ? `Hi ${name},` : 'Hi there,';
  const safeTitle = eventTitle ? escapeHtml(eventTitle) : 'your event';
  const htmlContent = `
    <p style="font-size:16px;">${greeting}</p>
    <p style="font-size:16px;line-height:1.5;">
      Thanks again for your review on ${safeTitle}. Would you be happy for us to feature it
      publicly on Set The Date? Just reply with yes or no.
    </p>
    <p style="font-size:16px;">Thanks,<br />The Set The Date Team</p>
  `;
  const textContent = `${greeting}\n\nThanks again for your review on ${eventTitle || 'your event'}. Would you be happy for us to feature it publicly on Set The Date? Just reply with yes or no.\n\nThanks,\nThe Set The Date Team`;
  return { htmlContent, textContent };
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

    const { reviewId } = req.body || {};
    if (!reviewId) {
      return res.status(400).json({ error: 'Missing reviewId' });
    }

    const reviewRef = db.collection('reviews').doc(reviewId);
    const reviewSnap = await reviewRef.get();
    if (!reviewSnap.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const review = reviewSnap.data() || {};
    const reviewerEmail = review.reviewerEmail || review.organiserEmail || null;
    if (!reviewerEmail) {
      return res.status(400).json({ error: 'Reviewer email missing' });
    }

    const reviewerName =
      review.reviewerName || review.firstName || review.organiserName || '';
    const eventTitle = review.pollTitleSnapshot || review.eventTitle || '';
    const { htmlContent, textContent } = buildConsentEmail({
      name: reviewerName,
      eventTitle,
    });

    await sendBrevoEmail({
      sender: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
      to: [{ email: reviewerEmail }],
      subject: 'Can we feature your review?',
      htmlContent,
      textContent,
    });

    await reviewRef.update({
      publicConsent: review.publicConsent || 'pending',
      consentRequestedAt: FieldValue.serverTimestamp(),
      replyEmailLog: FieldValue.arrayUnion({
        text: 'Consent request sent',
        subject: 'Can we feature your review?',
        sentAt: new Date().toISOString(),
        adminName: adminEmail,
        type: 'consent_request',
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('admin review consent request failed', error);
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: error?.message || 'Unable to request consent' });
  }
}
