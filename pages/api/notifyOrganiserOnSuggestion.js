export default async function handler(req, res) {
  const { organiserEmail, firstName, eventTitle, message, pollId } = req.body;

  if (!organiserEmail || !eventTitle || !message || !pollId) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const html = `
    <div style="text-align:center;">
      <img src="https://setthedate.app/images/email-logo.png" width="200" />
    </div>
    <p>Hey ${firstName},</p>
    <p>You received a suggestion on your event <strong>${eventTitle}</strong>:</p>
    <blockquote style="border-left: 4px solid #ccc; padding-left: 10px;">${message}</blockquote>
    <p>You can update the event here:</p>
    <p><a href="https://setthedate.app/edit/${pollId}" style="font-size: 18px;">Edit Event</a></p>
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
        to: [{ email: organiserEmail }],
        subject: `💡 Suggestion for "${eventTitle}"`,
        htmlContent: html,
      }),
    });

    res.status(200).json({ message: 'Organiser notified of suggestion' });
  } catch (err) {
    console.error('❌ Error notifying organiser:', err);
    res.status(500).json({ message: 'Failed to send email' });
  }
}
