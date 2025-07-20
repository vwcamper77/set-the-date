export default async function handler(req, res) {
  console.log('[ATTENDEE EMAIL] Incoming request:', req.body);

  const { email, firstName, eventTitle, pollId, location = '' } = req.body;

  if (!email || !firstName || !eventTitle || !pollId) {
    console.log('[ATTENDEE EMAIL] Missing fields', { email, firstName, eventTitle, pollId, location });
    return res.status(400).json({ message: 'Missing required fields' });
  }

  console.log('[ATTENDEE EMAIL] Ready to send email for:', email, firstName, eventTitle, pollId);

  const pollLink = `https://plan.setthedate.app/poll/${pollId}`;

  const html = `
    <div style="text-align:center;">
      <img src="https://plan.setthedate.app/images/email-logo.png" width="200" alt="Set The Date logo" />
    </div>
    <p>Hi ${firstName},</p>
    <p>Thanks for joining the event: <strong>${eventTitle}</strong>${location ? ' in <strong>' + location + '</strong>' : ''}.</p>
    <p>You can update your vote anytime using the link below:</p>
    <p><a href="${pollLink}" style="font-size: 18px;">Update My Vote</a></p>
    <p style="margin-top:24px;">
      Want to plan your own BBQ, party, or trip? <br/>
      <a href="https://plan.setthedate.app" style="color:#0070f3;font-weight:bold;">Create your own event in seconds</a>
    </p>
    <p>If you have any questions, just reply to this email—Gavin reads every message!</p>
    <p>– Gavin<br>Founder, Set The Date</p>
  `;

  const text = `
Hi ${firstName},

Thanks for joining the event: ${eventTitle}${location ? ' in ' + location : ''}.

You can update your vote anytime using the link below:
${pollLink}

Want to plan your own event? https://plan.setthedate.app

If you have any questions, just reply to this email—Gavin reads every message!

– Gavin
Founder, Set The Date
  `;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Gavin at Set The Date', email: 'hello@setthedate.app' },
        replyTo: { name: 'Gavin', email: 'hello@setthedate.app' },
        to: [{ email }],
        subject: `✅ You’ve joined "${eventTitle}"`,
        htmlContent: html,
        textContent: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ATTENDEE EMAIL] ERROR:', errorText);
      return res.status(500).json({ message: 'Brevo send failed', error: errorText });
    }

    res.status(200).json({ message: 'Attendee email sent' });

  } catch (err) {
    console.error('[ATTENDEE EMAIL] ERROR:', err);
    res.status(500).json({ message: 'Failed to send email', error: err.message || err });
  }
}
