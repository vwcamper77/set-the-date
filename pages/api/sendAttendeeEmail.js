export default async function handler(req, res) {
  const { email, firstName, eventTitle, pollId } = req.body;

  if (!email || !firstName || !eventTitle || !pollId) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  const html = `
    <div style="text-align:center;">
      <img src="https://setthedate.app/images/setthedate-logo.png" width="200" />
    </div>
    <p>Hey ${firstName},</p>
    <p>Thanks for joining the poll: <strong>${eventTitle}</strong>.</p>
    <p>If you need to update your vote, here’s the link:</p>
    <p><a href="https://setthedate.app/poll/${pollId}" style="font-size: 18px;">Update Vote</a></p>
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
        subject: `✅ You're in! "${eventTitle}" poll confirmed`,
        htmlContent: html,
      }),
    });

    res.status(200).json({ message: 'Email sent to attendee' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to send attendee email' });
  }
}
