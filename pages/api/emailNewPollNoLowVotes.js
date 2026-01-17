// pages/api/emailNewPollNoLowVotes.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { organiserEmail, organiserFirstName, eventTitle, pollId, editToken, reminderCount = 0 } = req.body;

  if (!organiserEmail || !eventTitle || !pollId || !editToken) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const pollUrl = `https://plan.setthedate.app/poll/${pollId}`;
  const editUrl = `https://plan.setthedate.app/edit/${pollId}?token=${editToken}`;

  let subject, html;
  if (reminderCount === 0) {
    // First reminder: resend "poll live" share email
    subject = `Your poll "${eventTitle}" is live! Share your link with friends 🎉`;
    html = `
      <div style="text-align:center;">
        <img src="https://plan.setthedate.app/images/email-logo.png" width="200" style="border-radius: 16px; margin-bottom:24px;" alt="Set The Date" />
      </div>
      <p>Hey ${organiserFirstName || 'there'},</p>
      <p>Your <strong>Set The Date</strong> poll is still waiting for votes.</p>
      <p>Share this link with your friends to collect their votes:</p>
      <p><a href="${pollUrl}" style="font-size: 18px; color: #007bff;">${pollUrl}</a></p>
      <h3 style="margin-top:24px;">📣 Share Event with Friends</h3>
      <ul style="list-style:none;padding-left:0;font-size:16px;">
        <li>📲 <a href="https://api.whatsapp.com/send?text=Help%20choose%20a%20date%20for%20'${eventTitle}'%20here:%20${pollUrl}">Share via WhatsApp</a></li>
        <li>📱 <a href="sms:?body=Help%20choose%20a%20date%20for%20'${eventTitle}':%20${pollUrl}">Share via SMS</a></li>
        <li>💬 <a href="https://discord.com/channels/@me">Share via Discord</a></li>
        <li>📨 <a href="https://slack.com/">Share via Slack</a></li>
        <li>🔗 <a href="${pollUrl}">Copy Poll Link</a></li>
        <li>📧 <a href="mailto:?subject=Vote%20on%20Dates&body=Hey!%20Help%20choose%20a%20date%20for%20'${eventTitle}'%20here:%20${pollUrl}">Share via Email</a></li>
      </ul>
      <p style="margin-top:24px;">We’ll notify you as soon as people start responding.</p>
      <p style="margin-top:32px;">– The Set The Date Team</p>
    `;
  } else {
    // Second or later reminder: nudge, but still include share links
    subject = `Still waiting for votes on "${eventTitle}"? Try sharing again`;
    html = `
      <div style="text-align:center;">
        <img src="https://plan.setthedate.app/images/email-logo.png" width="200" style="border-radius: 16px; margin-bottom:24px;" alt="Set The Date" />
      </div>
      <p>Hi ${organiserFirstName || "there"},</p>
      <p>Your event <strong>${eventTitle}</strong> hasn’t had any responses yet. Sometimes a second nudge helps!</p>
      <p><a href="${editUrl}" style="font-size:16px;">🔗 Manage or re-share your event</a></p>
      <h3 style="margin-top:24px;">📣 Quick Share Links</h3>
      <ul style="list-style:none;padding-left:0;font-size:16px;">
        <li>📲 <a href="https://api.whatsapp.com/send?text=Help%20choose%20a%20date%20for%20'${eventTitle}'%20here:%20${pollUrl}">WhatsApp</a></li>
        <li>📱 <a href="sms:?body=Help%20choose%20a%20date%20for%20'${eventTitle}':%20${pollUrl}">SMS</a></li>
        <li>💬 <a href="https://discord.com/channels/@me">Discord</a></li>
        <li>📨 <a href="https://slack.com/">Slack</a></li>
        <li>📧 <a href="mailto:?subject=Vote%20on%20Dates&body=Hey!%20Help%20choose%20a%20date%20for%20'${eventTitle}'%20here:%20${pollUrl}">Email</a></li>
        <li>🔗 <a href="${pollUrl}">Copy Link</a></li>
      </ul>
      <p style="margin-top:30px;">Or <a href="${editUrl}">extend your deadline</a> if you want to give people more time to reply.</p>
      <p style="margin-top:40px;">Questions? Just reply—I’m always happy to help.<br><br>–Team, Set The Date</p>
    `;
  }

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Team at Set The Date', email: 'hello@setthedate.app' },
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

    res.status(200).json({ message: 'Low/no votes reminder sent' });

  } catch (err) {
    console.error('❌ Error sending no-votes email:', err.message || err);
    res.status(500).json({ message: 'Failed to send email', error: err.message });
  }
}
