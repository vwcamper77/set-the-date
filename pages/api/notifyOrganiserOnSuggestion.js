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
    <p>Hi ${organiserName || 'there'},</p>
    <p><strong>${senderName}</strong> sent you a suggestion about <strong>${eventTitle}</strong>:</p>
    <blockquote style="border-left: 4px solid #ccc; padding-left: 10px; margin: 10px 0;">${message}</blockquote>
    <p>You can make changes to your event here:</p>
    <p><a href="https://plan.setthedate.app/edit/${pollId}?token=${editToken}" style="font-size: 18px;">Edit Event</a></p>
    <p>Warm wishes,<br/>Team, Set The Date</p>
  `;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Team at Set The Date', email: 'hello@setthedate.app' },
        replyTo: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
        to: [{ email: organiserEmail }],
        subject: `💡 ${senderName} has a suggestion for "${eventTitle}"`,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Failed to send suggestion email:', error);
      return res.status(500).json({ error: 'Failed to send suggestion' });
    }

    return res.status(200).json({ message: 'Suggestion sent successfully' });
  } catch (err) {
    console.error('Error sending suggestion:', err);
    return res.status(500).json({ error: 'Failed to send suggestion' });
  }
}