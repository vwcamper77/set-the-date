export default async function handler(req, res) {
  const { email, firstName, eventTitle, pollId } = req.body;

  if (!email || !firstName || !eventTitle || !pollId) {
    console.error('❌ Missing fields:', { email, firstName, eventTitle, pollId });
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const html = `
    <div style="text-align:center; padding-bottom: 16px;">
      <img src="https://setthedate.app/images/email-logo.png" width="220" style="border-radius: 16px;" alt="Set The Date Logo" />
    </div>
    <p>Hey ${firstName},</p>
    <p>🎉 Someone just voted on your event: <strong>${eventTitle}</strong></p>
    <p>Tap below to view the live results:</p>
    <p style="text-align:center; padding: 12px;">
      <a href="https://setthedate.app/results/${pollId}" style="font-size: 18px; background:#000; color:white; padding:10px 20px; border-radius:6px; text-decoration:none;">
        View Results
      </a>
    </p>
    <p style="font-size: 14px; color: #777; text-align: center;">– The Set The Date Team</p>
  `;

  try {
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Set The Date', email: 'noreply@setthedate.app' },
        to: [{ email }],
        subject: `📥 Someone voted on "${eventTitle}"`,
        htmlContent: html,
      }),
    });

    if (!brevoRes.ok) {
      const error = await brevoRes.json();
      console.error('❌ Brevo error response:', error);
      return res.status(500).json({ message: 'Failed to send email', error });
    }

    res.status(200).json({ message: 'Organiser notified successfully' });
  } catch (err) {
    console.error('❌ Unexpected error sending organiser vote email:', err);
    res.status(500).json({ message: 'Failed to send email' });
  }
}
