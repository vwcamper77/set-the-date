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
    reminderNumber = 1,
  } = req.body || {};

  if (!organiserEmail || !eventTitle || !pollId) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const shareUrl = `https://plan.setthedate.app/share/${pollId}`;
  const editUrl = editToken
    ? `https://plan.setthedate.app/edit/${pollId}?token=${editToken}`
    : null;

  const reminderLabel = Number(reminderNumber) > 1 ? 'Still not shared?' : 'Your poll is ready';
  const subject =
    Number(reminderNumber) > 1
      ? `${reminderLabel} Open your share page for "${eventTitle}"`
      : `${reminderLabel} - share "${eventTitle}" now`;

  const manageLine = editUrl
    ? `<p style="margin-top:20px;">Need to make a change first? <a href="${editUrl}">Manage your poll</a>.</p>`
    : '';

  const html = `
    <div style="text-align:center;">
      <img src="https://plan.setthedate.app/images/email-logo.png" width="200" style="border-radius:16px;margin-bottom:24px;" alt="Set The Date" />
    </div>
    <p>Hi ${organiserFirstName || 'there'},</p>
    <p>Your poll <strong>${eventTitle}</strong> is ready, but it looks like it has not been shared yet.</p>
    <p>The next step is to share it in WhatsApp, email or text so people can vote.</p>
    <p style="margin:24px 0;">
      <a href="${shareUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;">
        Open share page
      </a>
    </p>
    ${manageLine}
    <p style="margin-top:24px;">We’ll keep an eye on responses once it has been shared.</p>
    <p style="margin-top:32px;">The Set The Date Team</p>
  `;

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

    return res.status(200).json({ message: 'Unshared poll reminder sent' });
  } catch (err) {
    console.error('❌ Error sending unshared poll reminder:', err.message || err);
    return res.status(500).json({ message: 'Failed to send email', error: err.message });
  }
}
