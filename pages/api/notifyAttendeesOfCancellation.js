// pages/api/notifyAttendeesOfCancellation.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { attendees, eventTitle } = req.body;
  if (!attendees || !eventTitle) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const htmlContent = `
    <p>Hi there,</p>
    <p>We’re sorry to inform you that the event "<strong>${eventTitle}</strong>" has been cancelled.</p>
    <p>No further action is required.</p>
    <p>Thanks for using Evening Out.</p>
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
        to: attendees.map((email) => ({ email })),
        subject: `"${eventTitle}" has been cancelled`,
        htmlContent,
      }),
    });

    if (!response.ok) throw new Error(await response.text());

    res.status(200).json({ message: 'Cancellation emails sent.' });
  } catch (err) {
    console.error('❌ Failed to send cancellation:', err);
    res.status(500).json({ message: 'Failed to notify attendees.' });
  }
}
