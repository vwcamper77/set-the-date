import { db as adminDb } from '@/lib/firebaseAdmin';
import { sendBrevoEmail } from '@/lib/brevo';

const buildReviewUrl = (pollId, editToken) =>
  `https://plan.setthedate.app/review/${pollId}?token=${editToken}`;

const buildOrganiserHtml = ({ organiserName, eventTitle, reviewUrl }) => `
  <div style="text-align:center;">
    <img src="https://plan.setthedate.app/images/email-logo.png" width="200" style="margin-bottom:24px;" alt="Set The Date" />
  </div>
  <p style="font-size:16px;">Hi ${organiserName || 'there'},</p>
  <p style="font-size:16px;">Hope your event <strong>${eventTitle}</strong> went well.</p>
  <p style="font-size:16px;">Could you leave a quick rating and review? It takes 30 seconds.</p>
  <div style="text-align:center; margin: 16px 0;">
    <a href="${reviewUrl}" style="background:#0f172a; color:white; padding: 12px 24px; text-decoration:none; border-radius: 999px; font-weight:bold; font-size:15px;">
      Leave a review
    </a>
  </div>
  <p style="font-size:13px; color:#666;">
    We only show public reviews with your consent. If something did not work, reply to this email and we will help.
  </p>
  <p style="margin-top: 30px; font-size: 14px;">– Team, Set The Date</p>
`;

const buildAttendeeHtml = ({ organiserName, eventTitle, reviewUrl }) => `
  <div style="text-align:center;">
    <img src="https://plan.setthedate.app/images/email-logo.png" width="200" style="margin-bottom:24px;" alt="Set The Date" />
  </div>
  <p style="font-size:16px;">Hi there,</p>
  <p style="font-size:16px;">Thanks for taking part in <strong>${eventTitle}</strong>${organiserName ? ` with ${organiserName}` : ''}.</p>
  <p style="font-size:16px;">Could you leave a quick rating and review? It takes 30 seconds.</p>
  <div style="text-align:center; margin: 16px 0;">
    <a href="${reviewUrl}" style="background:#0f172a; color:white; padding: 12px 24px; text-decoration:none; border-radius: 999px; font-weight:bold; font-size:15px;">
      Leave a review
    </a>
  </div>
  <p style="font-size:13px; color:#666;">
    We only show public reviews with your consent. If something did not work, reply to this email and we will help.
  </p>
  <p style="margin-top: 30px; font-size: 14px;">– Team, Set The Date</p>
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
    const pollRef = adminDb.collection('polls').doc(pollId);
    const pollSnap = await pollRef.get();

    if (!pollSnap.exists) {
      return res.status(404).json({ message: 'Poll not found' });
    }

    const poll = pollSnap.data() || {};
    const organiserEmail = poll.organiserEmail;
    const organiserName =
      poll.organiserFirstName ||
      poll.organiserName ||
      poll.organiserLastName ||
      poll.organizerName ||
      organiserEmail?.split('@')[0] ||
      'there';
    const eventTitle = poll.eventTitle || 'your event';
    const editToken = poll.editToken;

    if (!organiserEmail || !editToken) {
      return res.status(400).json({ message: 'Organiser email or edit token missing' });
    }

    const reviewUrl = buildReviewUrl(pollId, editToken);
    const votesSnap = await pollRef.collection('votes').get();
    const attendeeEmails = Array.from(
      new Set(
        votesSnap.docs
          .map((doc) => doc.data()?.email)
          .filter((email) => email && email !== organiserEmail)
      )
    );

    await sendBrevoEmail({
      sender: { name: 'Team at Set The Date', email: 'hello@setthedate.app' },
      replyTo: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
      to: [{ email: organiserEmail }],
      subject: `Quick review for "${eventTitle}"?`,
      htmlContent: buildOrganiserHtml({ organiserName, eventTitle, reviewUrl }),
    });

    if (attendeeEmails.length) {
      await sendBrevoEmail({
        sender: { name: 'Team at Set The Date', email: 'hello@setthedate.app' },
        replyTo: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
        to: attendeeEmails.map((email) => ({ email })),
        subject: `How was "${eventTitle}"?`,
        htmlContent: buildAttendeeHtml({ organiserName, eventTitle, reviewUrl }),
      });
    }

    return res.status(200).json({ message: 'Review emails sent' });
  } catch (error) {
    console.error('❌ Error sending review emails:', error);
    return res.status(500).json({ message: 'Failed to send review emails' });
  }
}
