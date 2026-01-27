import { sendBrevoEmail } from '@/lib/brevo';

const buildHtml = ({ organiserName, eventTitle, resultsUrl, location }) => `
  <div style="text-align:center;">
    <img src="https://plan.setthedate.app/images/email-logo.png" width="200" style="margin-bottom:24px;" alt="Set The Date" />
  </div>
  <p style="font-size:16px;">Hi ${organiserName || 'there'},</p>
  <p style="font-size:16px;">
    Voting has now closed for <strong>${eventTitle}</strong>${location ? ` in <strong>${location}</strong>` : ''}, but the date hasn't been locked in yet.
  </p>
  <p style="font-size:15px;">Once you finalise the date:</p>
  <ul style="font-size:15px; padding-left:18px;">
    <li>We’ll notify everyone who voted.</li>
    <li>They can save it to their calendar.</li>
    <li>The date will be locked in for the group.</li>
  </ul>
  <div style="text-align:center; margin: 20px 0;">
    <a href="${resultsUrl}" style="background:#0f172a; color:white; padding: 12px 24px; text-decoration:none; border-radius: 999px; font-weight:bold; font-size:15px;">
      Finalise your event
    </a>
  </div>
  <p style="margin-top: 24px; font-size: 14px;">Thanks,<br/>The Set The Date Team</p>
`;

const buildText = ({ organiserName, eventTitle, resultsUrl, location }) => [
  `Hi ${organiserName || 'there'},`,
  '',
  `Voting has now closed for "${eventTitle}"${location ? ` in ${location}` : ''}, but the date hasn't been locked in yet.`,
  '',
  'Once you finalise the date:',
  "- we'll notify everyone who voted",
  '- they can save it to their calendar',
  '- and the date will be locked in for the group',
  '',
  'Finalise your event here:',
  resultsUrl,
  '',
  'Thanks,',
  'The Set The Date Team',
].join('\n');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { organiserEmail, organiserName, eventTitle, resultsUrl, location } = req.body || {};

  if (!organiserEmail || !eventTitle || !resultsUrl) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    await sendBrevoEmail({
      sender: { name: 'Team at Set The Date', email: 'hello@setthedate.app' },
      replyTo: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
      to: [{ email: organiserEmail }],
      subject: `Reminder: please finalise "${eventTitle}"`,
      htmlContent: buildHtml({ organiserName, eventTitle, resultsUrl, location }),
      textContent: buildText({ organiserName, eventTitle, resultsUrl, location }),
    });

    return res.status(200).json({ message: 'Finalise reminder sent' });
  } catch (error) {
    console.error('❌ Error sending finalise reminder:', error);
    return res.status(500).json({ message: 'Failed to send finalise reminder' });
  }
}
