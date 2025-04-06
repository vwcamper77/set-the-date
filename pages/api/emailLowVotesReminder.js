export default async function handler(req, res) {
    const { organiserEmail, organiserName, eventTitle, location, pollId, voteCount } = req.body;
  
    if (!organiserEmail || !organiserName || !eventTitle || !pollId || !location) {
      return res.status(400).json({ message: 'Missing fields' });
    }
  
    const html = `
      <div style="text-align:center;">
        <img src="https://plan.setthedate.app/images/email-logo.png" width="220" style="margin-bottom: 20px;" />
      </div>
  
      <p style="font-size: 16px;">Hi ${organiserName},</p>
  
      <p style="font-size: 16px;">
        Only <strong>${voteCount}</strong> people have voted so far for your event <strong>"${eventTitle}"</strong> in <strong>${location}</strong>.
      </p>
  
      <p style="font-size: 16px;">
        Want to extend the deadline by 3 more days to get more votes?
      </p>
  
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://plan.setthedate.app/edit/${pollId}" style="background: #facc15; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
          🔁 Extend Deadline Now
        </a>
      </div>
  
      <p style="font-size: 14px; color: #666;">
        Or view your event here: <br/>
        <a href="https://plan.setthedate.app/results/${pollId}">https://plan.setthedate.app/results/${pollId}</a>
      </p>
  
      <p style="margin-top: 40px; font-size: 14px; color: #666;">
        — The Set The Date Team
      </p>
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
          subject: `🔔 Few people have voted for "${eventTitle}" in ${location}`,
          htmlContent: html,
        }),
      });
  
      if (!response.ok) {
        const text = await response.text();
        return res.status(500).json({ message: 'Brevo send failed', error: text });
      }
  
      res.status(200).json({ message: 'Reminder email sent' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Email failed' });
    }
  }
  