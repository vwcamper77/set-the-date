import { sendBrevoEmail } from '@/lib/brevo';
import { db as adminDb } from '@/lib/firebaseAdmin';

const GOOGLE_REVIEW_URL = 'https://g.page/r/CcNH5Ymc8VoGEBM/review';
const FACEBOOK_REVIEW_URL = 'https://www.facebook.com/setthedateapp/reviews';

const normalizeName = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed;
};

const firstNameFromDisplay = (value) => {
  const normalized = normalizeName(value);
  if (!normalized) return null;
  return normalized.split(' ')[0];
};

const buildButton = (label, url, styles = '') => `
  <a href="${url}" style="display:inline-block; background:#0f172a; color:#fff; padding:12px 24px; text-decoration:none; border-radius:999px; font-weight:700; font-size:15px; ${styles}">
    ${label}
  </a>
`;

const buildReviewEmail = ({ recipientName, eventTitle, location, reviewUrl }) => `
  <div style="font-family:Arial,sans-serif; font-size:16px; color:#0f172a;">
    <p>Hi ${recipientName || 'there'},</p>
    <p>Hope your event "${eventTitle}"${location ? ` in ${location}` : ''} went well.</p>
    <p>Could you leave a quick rating and review? It takes 30 seconds.</p>
    <div style="margin:20px 0; text-align:center;">
      ${buildButton('Leave a review', reviewUrl)}
    </div>
    <p style="font-size:13px; color:#475569;">We only show public reviews with your consent.</p>
    <p style="font-size:13px; color:#475569;">If something did not work, reply to this email and we will help.</p>
    <p style="margin-top:24px;">Thanks,<br />The Set The Date Team</p>
  </div>
`;

const buildAttendeeEmail = ({ recipientName, eventTitle, location }) => `
  <div style="font-family:Arial,sans-serif; font-size:16px; color:#0f172a;">
    <p>Hi ${recipientName || 'there'},</p>
    <p>Thanks for being part of "${eventTitle}"${location ? ` in ${location}` : ''}.</p>
    <p>If you'd like to share your experience with Set The Date, you can leave a public review here:</p>
    <div style="margin:16px 0; text-align:center;">
      ${buildButton('Post on Google', GOOGLE_REVIEW_URL, 'background:#16a34a;')}
    </div>
    <div style="margin:12px 0; text-align:center;">
      ${buildButton('Post on Facebook', FACEBOOK_REVIEW_URL, 'background:#2563eb;')}
    </div>
    <p style="margin-top:24px;">Thanks,<br />The Set The Date Team</p>
  </div>
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { pollId } = req.body || {};
  if (!pollId) {
    return res.status(400).json({ message: 'Missing pollId' });
  }

  try {
    const pollSnap = await adminDb.collection('polls').doc(pollId).get();
    if (!pollSnap.exists) {
      return res.status(404).json({ message: 'Poll not found' });
    }

    const poll = pollSnap.data();
    const organiserEmail = poll.organiserEmail;
    const editToken = poll.editToken;
    if (!organiserEmail || !editToken) {
      return res.status(400).json({ message: 'Missing organiser email or edit token' });
    }

    const eventTitle = poll.eventTitle || 'your event';
    const location = poll.location || '';
    const reviewUrl = `https://plan.setthedate.app/review/${pollId}?token=${editToken}`;
    const organiserName = normalizeName(
      poll.organiserFirstName || poll.organiserName || poll.organiser
    );

    const sender = { name: 'Team at Set The Date', email: 'hello@setthedate.app' };

    await sendBrevoEmail({
      sender,
      replyTo: { email: 'hello@setthedate.app' },
      to: [{ email: organiserEmail, name: organiserName || undefined }],
      subject: `Quick review for "${eventTitle}"?`,
      htmlContent: buildReviewEmail({
        recipientName: organiserName,
        eventTitle,
        location,
        reviewUrl,
      }),
      textContent: `Hi ${organiserName || 'there'},\n\nHope your event "${eventTitle}"${
        location ? ` in ${location}` : ''
      } went well.\n\nCould you leave a quick rating and review? It takes 30 seconds.\n\nLeave a review: ${reviewUrl}\n\nThanks,\nThe Set The Date Team`,
    });

    const votesSnap = await adminDb.collection('polls').doc(pollId).collection('votes').get();
    const attendeeSends = [];
    votesSnap.forEach((voteDoc) => {
      const voteData = voteDoc.data() || {};
      const email = normalizeName(voteData.email);
      if (!email || email === organiserEmail) return;
      const attendeeName = firstNameFromDisplay(voteData.displayName || voteData.name);
      attendeeSends.push(
        sendBrevoEmail({
          sender,
          replyTo: { email: 'hello@setthedate.app' },
          to: [{ email, name: attendeeName || undefined }],
          subject: `Thanks for being part of "${eventTitle}"`,
          htmlContent: buildAttendeeEmail({
            recipientName: attendeeName,
            eventTitle,
            location,
          }),
          textContent: `Hi ${attendeeName || 'there'},\n\nThanks for being part of "${eventTitle}"${
            location ? ` in ${location}` : ''
          }.\n\nShare your experience with Set The Date:\nGoogle: ${GOOGLE_REVIEW_URL}\nFacebook: ${FACEBOOK_REVIEW_URL}\n\nThanks,\nThe Set The Date Team`,
        })
      );
    });

    if (attendeeSends.length) {
      await Promise.all(attendeeSends);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('send review request error', error);
    return res.status(500).json({ message: 'Failed to send review email.' });
  }
}
