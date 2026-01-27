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

const buildEmail = ({ name, message }) => {
  const greeting = name ? `Hi ${name},` : 'Hi there,';
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');
  const htmlContent = `
    <p style="font-size:16px;">${greeting}</p>
    <p style="font-size:16px;line-height:1.5;">${safeMessage}</p>
    <p style="font-size:16px;">Thanks,<br />The Set The Date Team</p>
  `;
  const textContent = `${greeting}\n\n${message}\n\nThanks,\nThe Set The Date Team`;
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

    const { reviewId, subject, message } = req.body || {};
    if (!reviewId || !subject || !message) {
      return res.status(400).json({ error: 'Missing reviewId, subject, or message' });
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
    const { htmlContent, textContent } = buildEmail({ name: reviewerName, message });

    await sendBrevoEmail({
      sender: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
      to: [{ email: reviewerEmail }],
      subject,
      htmlContent,
      textContent,
    });

    await reviewRef.update({
      replyEmailLog: FieldValue.arrayUnion({
        text: message,
        subject,
        sentAt: new Date().toISOString(),
        adminName: adminEmail,
        type: 'contact',
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('admin review contact failed', error);
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: error?.message || 'Unable to send email' });
  }
}
