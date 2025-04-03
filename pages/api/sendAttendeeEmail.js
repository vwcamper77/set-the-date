export default async function handler(req, res) {
  const { email, firstName, eventTitle, pollId } = req.body;

  if (!email || !firstName || !eventTitle || !pollId) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const html = `
    <div style="text-align:center;">
      <img src="https://setthedate.app/images/email-logo.png" width="200" />
    </div>
    <p>Hi ${firstName},</p>
    <p>Thanks for joining the event: <strong>${eventTitle}</strong>.</p>
    <p>You can update your vote anytime using the link below:</p>
    <p><a href="https://setthedate.app/poll/${pollId}" style="font-size: 18px;">Update My Vote</a></p>
    <p>– The Set The Date Team</p>
  `;

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Set The Date', email: 'noreply@setthedate.app' },
        to: [{ email }],
        subject: `✅ You’ve joined "${eventTitle}"`,
        htmlContent: html,
      }),
    });

    res.status(200).json({ message: 'Attendee email sent' });
  } catch (err) {
    console.error('❌ Error sending attendee email:', err);
    res.status(500).json({ message: 'Failed to send email' });
  }
}
