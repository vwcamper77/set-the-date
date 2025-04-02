export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
  
    const { emails, organiserName, eventTitle, pollId } = req.body;
  
    if (!emails || emails.length === 0 || !organiserName || !eventTitle || !pollId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
  
    const pollLink = `https://setthedate.app/poll/${pollId}`;
    const subject = `Update: ${organiserName} made changes to "${eventTitle}"`;
  
    const htmlContent = `
      <div style="text-align: center;">
        <img src="https://setthedate.app/images/eveningout-logo.png" width="200" />
      </div>
      <p>Hey there,</p>
      <p><strong>${organiserName}</strong> just made some changes to the event <strong>"${eventTitle}"</strong>.</p>
      <p>Please check your availability again and vote if needed:</p>
      <div style="margin: 20px 0;">
        <a href="${pollLink}" style="display: inline-block; padding: 12px 20px; background-color: #000; color: #fff; border-radius: 6px; text-decoration: none;">Vote on New Dates</a>
      </div>
      <p>Thanks!<br />– The Evening Out Team</p>
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
          to: emails.map(email => ({ email })),
          subject,
          htmlContent,
        }),
      });
  
      if (!response.ok) throw new Error(await response.text());
  
      res.status(200).json({ message: 'Change notifications sent.' });
    } catch (err) {
      console.error('❌ Email send failed:', err);
      res.status(500).json({ message: 'Failed to notify attendees of change.' });
    }
  }
  