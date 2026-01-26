import { nanoid } from 'nanoid';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { isAdminEmail } from '@/lib/adminUsers';
import { db as adminDb } from '@/lib/firebaseAdmin';
import { sendBrevoEmail } from '@/lib/brevo';
import { defaultReplyTo, defaultSender } from '@/lib/emailConfig';

const baseAppUrl =
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://plan.setthedate.app';

const buildOrganiserEmail = ({ organiserName, eventTitle, reviewUrl }) => {
  const safeName = organiserName || 'there';
  const safeTitle = eventTitle || 'your event';
  const subject = `Quick review for "${safeTitle}"?`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <p>Hi ${safeName},</p>
      <p>Hope your event "<strong>${safeTitle}</strong>" went well.</p>
      <p>Could you leave a quick rating and review? It takes 30 seconds.</p>
      <p style="margin: 20px 0;">
        <a href="${reviewUrl}" style="background:#0f172a; color:white; padding: 12px 24px; text-decoration:none; border-radius: 999px; font-weight:bold; font-size:15px;">
          Leave a review
        </a>
      </p>
      <p style="font-size: 13px; color: #6b7280;">We only show public reviews with your consent. If something did not work, reply to this email and we will help.</p>
      <p>Thanks,<br />The Set The Date Team</p>
    </div>
  `;
  const textContent = [
    `Hi ${safeName},`,
    '',
    `Hope your event "${safeTitle}" went well.`,
    '',
    'Could you leave a quick rating and review? It takes 30 seconds.',
    '',
    `Leave a review: ${reviewUrl}`,
    '',
    'We only show public reviews with your consent. If something did not work, reply to this email and we will help.',
    '',
    'Thanks,',
    'The Set The Date Team',
  ].join('\n');
  return { subject, htmlContent, textContent };
};

const buildAttendeeEmail = ({ attendeeName, eventTitle, reviewUrl }) => {
  const safeName = attendeeName || 'there';
  const safeTitle = eventTitle || 'your event';
  const subject = `How did "${safeTitle}" go?`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <p>Hi ${safeName},</p>
      <p>Thanks for joining "<strong>${safeTitle}</strong>".</p>
      <p>Could you leave a quick rating and review? It takes 30 seconds.</p>
      <p style="margin: 20px 0;">
        <a href="${reviewUrl}" style="background:#0f172a; color:white; padding: 12px 24px; text-decoration:none; border-radius: 999px; font-weight:bold; font-size:15px;">
          Leave a review
        </a>
      </p>
      <p style="font-size: 13px; color: #6b7280;">We only show public reviews with your consent. If something did not work, reply to this email and we will help.</p>
      <p>Thanks,<br />The Set The Date Team</p>
    </div>
  `;
  const textContent = [
    `Hi ${safeName},`,
    '',
    `Thanks for joining "${safeTitle}".`,
    '',
    'Could you leave a quick rating and review? It takes 30 seconds.',
    '',
    `Leave a review: ${reviewUrl}`,
    '',
    'We only show public reviews with your consent. If something did not work, reply to this email and we will help.',
    '',
    'Thanks,',
    'The Set The Date Team',
  ].join('\n');
  return { subject, htmlContent, textContent };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { pollId } = req.body || {};
  if (!pollId) {
    return res.status(400).json({ error: 'Missing pollId.' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const adminEmail = decoded?.email || decoded?.userEmail || '';
    if (!isAdminEmail(adminEmail)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const pollRef = adminDb.collection('polls').doc(pollId);
    const pollSnap = await pollRef.get();
    if (!pollSnap.exists) {
      return res.status(404).json({ error: 'Poll not found.' });
    }

    const poll = pollSnap.data() || {};
    if (!poll.editToken) {
      return res.status(400).json({ error: 'Missing organiser edit token.' });
    }

    let reviewToken = poll.reviewToken;
    if (!reviewToken) {
      reviewToken = nanoid(32);
      await pollRef.set({ reviewToken }, { merge: true });
    }

    const eventTitle = poll.eventTitle || 'your event';
    const organiserName =
      poll.organiserFirstName || poll.organiserName || poll.organiser || '';
    const organiserEmail = (poll.organiserEmail || '').trim();
    const organiserReviewUrl = `${baseAppUrl}/review/${pollId}?token=${poll.editToken}`;
    const attendeeReviewUrl = `${baseAppUrl}/review/${pollId}?token=${reviewToken}`;

    let organiserSent = false;
    if (organiserEmail) {
      const organiserEmailContent = buildOrganiserEmail({
        organiserName,
        eventTitle,
        reviewUrl: organiserReviewUrl,
      });
      await sendBrevoEmail({
        sender: defaultSender,
        replyTo: defaultReplyTo,
        to: [{ email: organiserEmail, name: organiserName || undefined }],
        subject: organiserEmailContent.subject,
        htmlContent: organiserEmailContent.htmlContent,
        textContent: organiserEmailContent.textContent,
      });
      organiserSent = true;
    }

    const votesSnap = await pollRef.collection('votes').get();
    const attendeeMap = new Map();
    votesSnap.forEach((voteDoc) => {
      const vote = voteDoc.data() || {};
      const email = (vote.email || '').trim();
      if (!email) return;
      if (organiserEmail && email.toLowerCase() === organiserEmail.toLowerCase()) return;
      const name = (vote.displayName || vote.name || '').trim();
      const key = email.toLowerCase();
      if (!attendeeMap.has(key)) {
        attendeeMap.set(key, { email, name: name || undefined });
      }
    });

    let attendeeSentCount = 0;
    for (const attendee of attendeeMap.values()) {
      const attendeeEmailContent = buildAttendeeEmail({
        attendeeName: attendee.name,
        eventTitle,
        reviewUrl: attendeeReviewUrl,
      });
      await sendBrevoEmail({
        sender: defaultSender,
        replyTo: defaultReplyTo,
        to: [{ email: attendee.email, name: attendee.name }],
        subject: attendeeEmailContent.subject,
        htmlContent: attendeeEmailContent.htmlContent,
        textContent: attendeeEmailContent.textContent,
      });
      attendeeSentCount += 1;
    }

    return res.status(200).json({
      ok: true,
      organiserSent,
      attendeeSentCount,
    });
  } catch (error) {
    console.error('admin review email send failed', error);
    const status = error?.statusCode || 500;
    return res.status(status).json({
      error: error?.message || 'Unable to send review emails.',
    });
  }
}
