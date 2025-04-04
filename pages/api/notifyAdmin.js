export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST allowed' });
  }

  const { organiserName, eventTitle, location, selectedDates, pollId, pollLink } = req.body;

  if (!organiserName || !eventTitle || !pollLink) {
    console.error('❌ Missing required fields for admin notification:', req.body);
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px;">
      <h2>📅 New Event Created on Set The Date</h2>
      <p><strong>Organiser:</strong> ${organiserName}</p>
      <p><strong>Event:</strong> ${eventTitle}</p>
      <p><strong>Location:</strong> ${location}</p>
      <p><strong>Dates:</strong> ${selectedDates.join(', ')}</p>
      <p><strong>Poll Link:</strong> <a href="${pollLink}">${pollLink}</a></p>
    </div>
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
        to: [{ email: 'gavinferns@hotmail.com' }],
        subject: `📬 New Event: ${eventTitle} by ${organiserName}`,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Brevo API error:', error);
      return res.status(500).json({ message: 'Failed to send admin email' });
    }

    res.status(200).json({ message: 'Admin notified' });
  } catch (error) {
    console.error('❌ Admin notification failed:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
