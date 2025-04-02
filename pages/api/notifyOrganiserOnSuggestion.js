// pages/api/notifyOrganiserOnSuggestion.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const {
    organiserEmail,
    organiserName,
    eventTitle,
    pollId,
    editToken, // ✅ Make sure we grab this from the request
    name,
    email,
    message,
  } = req.body;

  if (!organiserEmail || !eventTitle || !pollId || !name || !email || !message || !editToken) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const pollLink = `https://setthedate.app/edit/${pollId}?token=${editToken}`; // ✅ Include edit token in URL

  const htmlContent = `
    <div style="text-align: center;">
      <img src="https://setthedate.app/images/eveningout-logo.png" width="200" />
    </div>
    <p>Hey ${organiserName || 'organiser'},</p>
    <p><strong>${name}</strong> just suggested a change for your "${eventTitle}" event.</p>
    <p><strong>Message:</strong></p>
    <blockquote style="border-left: 4px solid #ccc; padding-left: 10px; color: #333;">${message}</blockquote>
    <p>You can manage your event here:</p>
    <a href="${pollLink}">${pollLink}</a>
    <p>– The Evening Out Team</p>
  `;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Evening Out', email: 'noreply@eveningout.social' },
        to: [{ email: organiserEmail }],
        subject: `Someone suggested a change for your "${eventTitle}" event`,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo error: ${errorText}`);
    }

    res.status(200).json({ message: 'Suggestion email sent successfully.' });
  } catch (err) {
    console.error('❌ Email send failed:', err);
    res.status(500).json({ message: 'Failed to send email to organiser.' });
  }
}
