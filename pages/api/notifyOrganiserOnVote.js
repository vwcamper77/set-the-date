export default async function handler(req, res) {
  const {
    organiserEmail,
    organiserName,
    eventTitle,
    pollId,
    voterName,
    message = '',
  } = req.body;

  console.log('🔔 Notify organiser payload:', req.body);

  if (!organiserEmail || !organiserName || !eventTitle || !pollId || !voterName) {
    console.error('❌ Missing required fields for organiser notification.');
    return res.status(400).json({ message: 'Missing fields' });
  }

  const html = `
    <div style="text-align:center;">
      <img src="https://setthedate.app/images/email-logo.png" width="200" style="border-radius: 16px;" />
    </div>
    <p>Hey ${organiserName},</p>
    <p><strong>${voterName}</strong> just voted on your event: <strong>${eventTitle}</strong>.</p>
    ${message ? `<p>They said: <em>"${message}"</em></p>` : ''}
    <p>You can see the latest results here:</p>
    <p><a href="https://setthedate.app/results/${pollId}" style="font-size: 18px;">View Results</a></p>
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
        subject: `📥 Someone voted on "${eventTitle}"`,
        htmlContent: html,
      }),
    });

    res.status(200).json({ message: 'Organiser notified' });
  } catch (err) {
    console.error('❌ Failed to send organiser email:', err);
    res.status(500).json({ message: 'Failed to send email' });
  }
}
