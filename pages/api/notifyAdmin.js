// pages/api/notifyAdmin.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method Not Allowed' });
    }
  
    const {
      firstName,
      eventTitle,
      location,
      selectedDates,
      pollId
    } = req.body;
  
    const formattedDates = selectedDates.map(date =>
      new Date(date).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    ).join(', ');
  
    const emailBody = `
  New poll just created by ${firstName}
  Event: ${eventTitle}
  Location: ${location}
  Dates: ${formattedDates}
  Poll Link: https://setthedate.app/poll/${pollId}
    `;
  
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'Evening Out', email: 'noreply@eveningout.social' },
          to: [{ email: 'gavinferns@hotmail.com', name: 'Admin' }],
          subject: `New Evening Out Poll Created`,
          htmlContent: `<pre>${emailBody}</pre>`
        })
      });
  
      if (!response.ok) {
        throw new Error(`Failed to send email. Status: ${response.status}`);
      }
  
      res.status(200).json({ message: 'Email sent to admin.' });
    } catch (error) {
      console.error('Error sending admin email:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
  