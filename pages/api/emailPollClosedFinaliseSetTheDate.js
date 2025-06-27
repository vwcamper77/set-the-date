// pages/api/emailPollClosedFinaliseSetTheDate.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const {
    organiserEmail,
    organiserFirstName,
    eventTitle,
    location,
    pollId,
    editToken
  } = req.body;

  if (!organiserEmail || !eventTitle || !pollId || !editToken) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const editUrl = `https://plan.setthedate.app/edit/${pollId}?token=${editToken}`;
  const resultsUrl = `https://plan.setthedate.app/results/${pollId}`;

  const subject = `Your poll "${eventTitle}" has closed — pick a final date or extend voting!`;
  const html = `
    <div style="text-align:center;">
      <img src="https://plan.setthedate.app/images/email-logo.png" width="200" style="margin-bottom:24px;" alt="Set The Date" />
    </div>
    <p>Hi ${organiserFirstName || 'there'},</p>
    <p>Your event <strong>${eventTitle}</strong> in <strong>${location || 'your chosen location'}</strong> has reached its deadline, but you haven't picked a final date yet.</p>
    <p>
      <a href="${editUrl}" style="background: #facc15; color: #000; padding: 10px 22px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold; margin:12px 0; display:inline-block;">
        Finalise a date or extend the poll
      </a>
    </p>
    <p>You can:</p>
    <ul style="font-size:16px;">
      <li>Review everyone’s votes and pick the best date</li>
      <li>Extend the deadline to get more responses</li>
      <li>Or cancel the event if needed</li>
    </ul>
    <p>See who voted and the current results here:<br/>
      <a href="${resultsUrl}">${resultsUrl}</a>
    </p>
    <p style="margin-top:30px;">Questions? Just reply—I’m happy to help.<br><br>– Gavin, Set The Date</p>
  `;

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Gavin at Set The Date', email: 'hello@setthedate.app' },
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

    res.status(200).json({ message: 'Poll closed finalise reminder sent' });

  } catch (err) {
    console.error('❌ Error sending poll closed email:', err.message || err);
    res.status(500).json({ message: 'Failed to send email', error: err.message });
  }
}
