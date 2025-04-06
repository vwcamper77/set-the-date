export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { attendees, pollId, eventTitle, organiser, location, message } = req.body;

  if (!attendees || !pollId || !eventTitle || !organiser || !location || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const htmlContent = (email) => `
    <div style="text-align:center;">
      <img src="https://plan.setthedate.app/images/setthedate-logo.png" width="200" />
    </div>
    <p>Hi there,</p>
    <p><strong>${organiser}</strong> has shared an update for the event: <strong>${eventTitle}</strong></p>
    <blockquote style="border-left: 4px solid #ccc; padding-left: 10px; margin: 10px 0;">${message}</blockquote>
    <p><strong>Location:</strong> ${location}</p>
    <p>Check or update your availability below:</p>
    <p><a href="https://plan.setthedate.app/poll/${pollId}" style="font-size: 18px;">Open Event Poll</a></p>
    <p>– The Set The Date Team</p>
  `;

  try {
    for (const attendee of attendees) {
      if (!attendee.email) continue;

      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Set The Date', email: 'noreply@setthedate.app' },
          to: [{ email: attendee.email }],
          subject: `📢 Update from ${organiser} about "${eventTitle}"`,
          htmlContent: htmlContent(attendee.email),
        }),
      });
    }

    res.status(200).json({ message: 'All attendees notified' });
  } catch (error) {
    console.error('Error sending emails to attendees:', error);
    res.status(500).json({ error: 'Failed to notify attendees' });
  }
}
