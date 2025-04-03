export default async function handler(req, res) {
  const { attendees, eventTitle } = req.body;

  if (!attendees || !eventTitle) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const html = `
    <div style="text-align:center;">
      <img src="https://setthedate.app/images/email-logo.png" width="200" />
    </div>
    <p>Hi there,</p>
    <p>The event <strong>${eventTitle}</strong> has been cancelled by the organiser.</p>
    <p>No further action is needed.</p>
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
          subject: `❌ "${eventTitle}" has been cancelled`,
          htmlContent: html,
        }),
      });
    }

    res.status(200).json({ message: 'Attendees notified of cancellation' });
  } catch (err) {
    console.error('❌ Error notifying attendees of cancellation:', err);
    res.status(500).json({ message: 'Failed to send emails' });
  }
}
