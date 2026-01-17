// emailLowVotesReminder.js
import { defaultSender, defaultReplyTo } from '@/lib/emailConfig';

export default async function handler(req, res) {
  const { organiserEmail, organiserName, eventTitle, location, pollId, voteCount } = req.body;

  if (!organiserEmail || !organiserName || !eventTitle || !pollId || !location) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  const html = `
    <div style="text-align:center;">
      <img src="https://plan.setthedate.app/images/email-logo.png" width="220" style="margin-bottom: 20px;" />
    </div>

    <p style="font-size: 16px;">Hi ${organiserName},</p>

    <p style="font-size: 16px;">
      Just a quick check-in — only <strong>${voteCount}</strong> people have voted on your event <strong>“${eventTitle}”</strong> in <strong>${location}</strong>.
    </p>

    <p style="font-size: 16px;">
      If you’d still like to go ahead, you can extend the deadline and give people more time to reply.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="https://plan.setthedate.app/edit/${pollId}" style="background: #facc15; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
        🔁 Extend Deadline Now
      </a>
    </div>

    <p style="font-size: 14px; color: #666;">
      Or view your event progress here:<br/>
      <a href="https://plan.setthedate.app/results/${pollId}">https://plan.setthedate.app/results/${pollId}</a>
    </p>

    <p style="margin-top: 40px; font-size: 14px; color: #666;">
      If you have any questions or feedback, just reply to this email — I’d love to hear how it’s going.
    </p>

    <p style="margin-top: 40px; font-size: 14px; color: #666;">
      Warm wishes,<br/>
      Set The Date Team
     
    </p>
  `;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: defaultSender,
        replyTo: defaultReplyTo,
        to: [{ email: organiserEmail, name: organiserName }],
        subject: `Still planning “${eventTitle}”? Extend the vote and get more replies`,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({ message: 'Brevo send failed', error: text });
    }

    res.status(200).json({ message: 'Reminder email sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Email failed' });
  }
}
