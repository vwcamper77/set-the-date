import { sendBrevoEmail } from '@/lib/brevo';

const buildHtml = ({ organiserName, eventTitle, voteStatusLine, shareUrl }) => `
  <div style="text-align:center;">
    <img src="https://plan.setthedate.app/images/email-logo.png" width="200" style="margin-bottom:24px;" alt="Set The Date" />
  </div>
  <p style="font-size:16px;">Hi ${organiserName || 'there'},</p>
  <p style="font-size:16px;">A quick nudge on your trip poll for <strong>${eventTitle}</strong>.</p>
  <p style="font-size:15px;">${voteStatusLine}</p>
  <p style="font-size:15px;">Share your link here to get a few more responses:</p>
  <p style="text-align:center; margin: 12px 0;">
    <a href="${shareUrl}" style="background:#0f172a; color:white; padding: 10px 20px; text-decoration:none; border-radius: 999px; font-weight:bold; font-size:14px;">
      Open share page
    </a>
  </p>
  <p style="font-size:14px;">
    Tip: drop it into the WhatsApp group with something like:<br/>
    "Quick one - can you tap Best / Maybe / No for the trip dates? Takes 30 seconds."
  </p>
  <p style="margin-top: 24px; font-size: 14px;">
    If you need a hand, just reply to this email.<br/>
    Thanks,<br/>
    The Set The Date Team
  </p>
  <p style="font-size:12px; color:#6b7280;">
    P.S. If you don't see future updates, check your Promotions or Spam folder and mark us as safe.
  </p>
`;

const buildText = ({ organiserName, eventTitle, voteStatusLine, shareUrl }) => [
  `Hi ${organiserName || 'there'},`,
  '',
  `A quick nudge on your trip poll for "${eventTitle}".`,
  '',
  voteStatusLine,
  '',
  'Share your link here to get a few more responses:',
  shareUrl,
  '',
  'Tip: drop it into the WhatsApp group with something like:',
  '"Quick one - can you tap Best / Maybe / No for the trip dates? Takes 30 seconds."',
  '',
  'If you need a hand, just reply to this email.',
  '',
  'Thanks,',
  'The Set The Date Team',
  '',
  "P.S. If you don't see future updates, check your Promotions or Spam folder and mark us as safe.",
].join('\n');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const {
    organiserEmail,
    organiserName,
    eventTitle,
    subject,
    voteStatusLine,
    shareUrl,
  } = req.body || {};

  if (!organiserEmail || !eventTitle || !subject || !voteStatusLine || !shareUrl) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    await sendBrevoEmail({
      sender: { name: 'Team at Set The Date', email: 'hello@setthedate.app' },
      replyTo: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
      to: [{ email: organiserEmail }],
      subject,
      htmlContent: buildHtml({ organiserName, eventTitle, voteStatusLine, shareUrl }),
      textContent: buildText({ organiserName, eventTitle, voteStatusLine, shareUrl }),
    });

    return res.status(200).json({ message: 'Vote nudge sent' });
  } catch (error) {
    console.error('❌ Error sending vote nudge:', error);
    return res.status(500).json({ message: 'Failed to send vote nudge' });
  }
}
