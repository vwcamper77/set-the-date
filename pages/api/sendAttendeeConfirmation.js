export default async function handler(req, res) {
    const { email, firstName, eventTitle, pollId, location } = req.body;
  
    if (!email || !firstName || !eventTitle || !pollId || !location) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
  
    const html = `
      <div style="text-align:center;">
        <img src="https://plan.setthedate.app/images/email-logo.png" width="220" style="margin-bottom: 20px;" />
      </div>
  
      <p style="font-size: 16px;">Hi ${firstName},</p>
  
      <p style="font-size: 16px;">
        You're invited to <strong>${eventTitle}</strong> in <strong>${location}</strong>! 🎉
      </p>
  
      <p style="font-size: 16px;">
        You can update your vote at any time using the button below:
      </p>
  
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://plan.setthedate.app/poll/${pollId}" style="background: #000; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
          Update My Vote
        </a>
      </div>
  
      <p style="font-size: 15px;">
        Once voting ends, the winning date will be revealed. Don’t miss it!
      </p>
  
      <p style="margin-top: 30px; font-size: 15px;">
        Or create your own event in seconds:
        <br />
        👉 <a href="https://plan.setthedate.app" style="color: #0070f3;">https://plan.setthedate.app</a>
      </p>
  
      <p style="margin-top: 40px; font-size: 14px; color: #666;">
        – The Set The Date Team
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
          to: [{ email }],
          subject: `✅ You’ve joined "${eventTitle}" in ${location}`,
          htmlContent: html,
        }),
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Brevo responded with error:', errorText);
        return res.status(500).json({ message: 'Brevo send failed', error: errorText });
      }
  
      res.status(200).json({ message: 'Attendee email sent' });
  
    } catch (err) {
      const errorBody = await err?.response?.text?.();
      console.error('❌ Error sending attendee email:', errorBody || err.message || err);
      res.status(500).json({ message: 'Failed to send email', error: errorBody || err.message });
    }
  }