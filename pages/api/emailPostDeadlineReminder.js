import { defaultSender, defaultReplyTo } from '@/lib/emailConfig';

export default async function handler(req, res) {
  const { organiserEmail, organiserName, eventTitle, location, pollId, editToken } = req.body;

  console.log("📬 emailPostDeadlineReminder received:", {
    pollId,
    editToken
  });

  if (!organiserEmail || !organiserName || !eventTitle || !pollId || !location || !editToken) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  const baseUrl = 'https://plan.setthedate.app';
  const resultsLink = `${baseUrl}/results/${pollId}?token=${editToken}`;
  const editLink = `${baseUrl}/edit/${pollId}?token=${editToken}`;

  const html = `
    <div style="text-align:center;">
      <img src="https://plan.setthedate.app/images/email-logo.png" width="220" style="margin-bottom: 20px;" />
    </div>

    <p style="font-size: 16px;">Hi ${organiserName},</p>

    <p style="font-size: 16px;">
      Just a quick reminder — the voting deadline has passed for your event <strong>"${eventTitle}"</strong> in <strong>${location}</strong>.
    </p>

    <p style="font-size: 16px;">
      If you're ready, you can finalise the best date or extend the deadline to give people more time to vote:
    </p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${resultsLink}" style="background: #16a34a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
        ✅ Finalise Event Date
      </a>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${editLink}" style="background: #facc15; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
        🔁 Extend Deadline
      </a>
      <div style="margin-top: 8px; font-size: 12px; color: #888;">
        or open: <br/><a href="${editLink}" style="color: #666;">${editLink}</a>
      </div>
    </div>

    <p style="font-size: 14px; color: #666;">
      You can always revisit your poll anytime here: <br/>
      <a href="${resultsLink}">${resultsLink}</a>
    </p>

    <p style="margin-top: 40px; font-size: 14px; color: #666;">
      Best wishes,<br/>
      Gavin<br/>
      Founder, Set The Date<br/>
      <a href="mailto:${defaultReplyTo.email}">${defaultReplyTo.email}</a>
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
        to: [{ email: organiserEmail }],
        replyTo: defaultReplyTo,
        subject: `⏳ Time to Finalise or Extend "${eventTitle}"`,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({ message: 'Brevo send failed', error: text });
    }

    res.status(200).json({ message: 'Post-deadline reminder sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Email failed' });
  }
}
