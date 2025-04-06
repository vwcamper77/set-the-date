export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  const {
    organiserEmail,
    organiserName,
    eventTitle,
    pollId,
    editToken,
    message,
    senderName,
    senderEmail,
  } = req.body;

  console.log('Received suggestion data:', req.body);

  if (!organiserEmail || !senderName || !senderEmail || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const html = `
    <div style="text-align:center;">
      <img src="https://plan.setthedate.app/images/email-logo.png" width="200" />
    </div>
    <p>Hi ${organiserName},</p>
    <p><strong>${senderName}</strong> has suggested a change to your event <strong>${eventTitle}</strong>.</p>
    <p><em>"${message}"</em></p>
    <p>You can update your event here:</p>
    <p><a href="https://plan.setthedate.app/edit/${pollId}?token=${editToken}" style="font-size: 18px;">Edit Event</a></p>
    <p>– The Set The Date Team</p>
  `;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Set The Date', email: 'noreply@setthedate.app' },
        to: [{ email: organiserEmail }],
        subject: `💡 ${senderName} suggested a change to "${eventTitle}"`,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Failed to send suggestion email:', error);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ message: 'Suggestion sent successfully' });

  } catch (err) {
    console.error('Error sending suggestion:', err);
    return res.status(500).json({ error: 'Failed to send suggestion' });
  }
}
