// pages/api/emailPollClosedFinaliseSetTheDate.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const {
    organiserEmail,
    organiserName,
    eventTitle,
    location,
    pollId,
    editToken
  } = req.body;

  if (!organiserEmail || !eventTitle || !pollId || !editToken) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const finaliseUrl = `https://plan.setthedate.app/results/${pollId}?token=${editToken}`;
  const editUrl = `https://plan.setthedate.app/edit/${pollId}?token=${editToken}`;

  const subject = `✅ Voting is closed — finalise your "${eventTitle}" event`;
  const html = `
    <div style="text-align:center;">
      <img src="https://plan.setthedate.app/images/email-logo.png" width="200" style="margin-bottom:24px;" alt="Set The Date" />
    </div>

    <p style="font-size:16px;">Hi ${organiserName || 'there'},</p>

    <p style="font-size:16px;">Your event <strong>${eventTitle}</strong> in <strong>${location || 'your chosen location'}</strong> has reached its deadline. It's time to lock in the final date!</p>

    <div style="text-align:center; margin: 24px 0;">
      <a href="${finaliseUrl}" style="background:#10b981; color:white; padding: 12px 24px; text-decoration:none; border-radius: 8px; font-weight:bold; font-size:16px;">
        ✅ Finalise Event Date
      </a>
    </div>

    <p style="font-size:15px;">Need to extend or cancel the event instead?</p>

    <div style="text-align:center; margin-bottom:24px;">
      <a href="${editUrl}" style="background:#facc15; color:black; padding:10px 20px; text-decoration:none; border-radius:6px; font-size:15px; font-weight:bold;">
        🔁 Edit or Extend Event
      </a>
    </div>

    <p style="font-size:14px;">You can also revisit your results here:</p>
    <p><a href="${finaliseUrl}" style="color:#3b82f6;">${finaliseUrl}</a></p>

    <p style="margin-top: 30px; font-size: 14px;">
      – Team, Set The Date
    </p>
  `;

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'T at Set The Date', email: 'hello@setthedate.app' },
        to: [{ email: organiserEmail }],
        subject,
        htmlContent: html,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('❌ Brevo responded with error:', errorText);
      return res.status(500).json({ message: 'Brevo send failed', error: errorText });
    }

    res.status(200).json({ message: '✅ Poll finalisation reminder sent' });

  } catch (err) {
    console.error('❌ Error sending poll closed email:', err.message || err);
    res.status(500).json({ message: 'Failed to send email', error: err.message });
  }
}
