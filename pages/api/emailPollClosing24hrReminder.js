// pages/api/emailPollClosing24hrReminder.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const {
    organiserEmail,
    organiserFirstName,
    eventTitle,
    pollId,
    editToken,
    deadline,
    votesCount = 0
  } = req.body;

  if (!organiserEmail || !eventTitle || !pollId || !editToken || !deadline) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const pollUrl = `https://plan.setthedate.app/poll/${pollId}`;
  const editUrl = `https://plan.setthedate.app/edit/${pollId}?token=${editToken}`;
  const deadlineFormatted = new Date(deadline).toLocaleString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const subject = `Last chance: "${eventTitle}" poll closes soon!`;
  const html = `
    <div style="text-align:center;">
      <img src="https://plan.setthedate.app/images/email-logo.png" width="200" style="margin-bottom:24px;" alt="Set The Date" />
    </div>
    <p>Hi ${organiserFirstName || 'there'},</p>
    <p>Your poll <strong>${eventTitle}</strong> is closing in less than 24 hours (${deadlineFormatted}) and only <strong>${votesCount}</strong> people have voted so far.</p>
    <p>
      <a href="${editUrl}" style="background: #facc15; color: #000; padding: 10px 22px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold; margin:12px 0; display:inline-block;">
        🔁 Remind friends or extend deadline
      </a>
    </p>
    <ul style="list-style:none;padding-left:0;font-size:16px;">
      <li>📲 <a href="https://api.whatsapp.com/send?text=Vote%20for%20dates%20on%20'${eventTitle}'%20here:%20${pollUrl}">Share via WhatsApp</a></li>
      <li>📱 <a href="sms:?body=Vote%20for%20dates%20on%20'${eventTitle}':%20${pollUrl}">Share via SMS</a></li>
      <li>💬 <a href="https://discord.com/channels/@me">Share via Discord</a></li>
      <li>📨 <a href="https://slack.com/">Share via Slack</a></li>
      <li>🔗 <a href="${pollUrl}">Copy Poll Link</a></li>
      <li>📧 <a href="mailto:?subject=Vote%20on%20Dates&body=Hey!%20Vote%20for%20dates%20on%20'${eventTitle}'%20here:%20${pollUrl}">Share via Email</a></li>
    </ul>
    <p style="margin-top:24px;">Or <a href="${editUrl}">extend the poll deadline</a> to give people more time to respond.</p>
    <p style="margin-top:40px;">Questions? Just reply—I’m happy to help.<br><br>– 
    , Set The Date</p>
  `;

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Set The Date', email: 'hello@setthedate.app' },
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

    res.status(200).json({ message: 'Poll closing soon reminder sent' });

  } catch (err) {
    console.error('❌ Error sending closing soon email:', err.message || err);
    res.status(500).json({ message: 'Failed to send email', error: err.message });
  }
}
