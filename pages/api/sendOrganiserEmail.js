// pages/api/sendOrganiserEmail.js

const escapeHtml = (unsafe = '') =>
  String(unsafe)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { firstName, email, pollId, editToken, eventTitle } = req.body;

  if (!firstName || !email || !pollId || !editToken || !eventTitle) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const baseUrl = 'https://plan.setthedate.app';
  const pollLink = `${baseUrl}/poll/${pollId}`;
  const sharePageLink = `${baseUrl}/share/${pollId}`;
  const editLink = `${baseUrl}/edit/${pollId}?token=${editToken}`;

  const safeName = escapeHtml(firstName);
  const safeTitle = escapeHtml(eventTitle);

  try {
    // Add to Brevo list (Organisers)
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        attributes: { FIRSTNAME: firstName },
        listIds: [4],
        updateEnabled: true,
      }),
    });

    // Share-first email (single email)
    const subject = `Share this now to get votes: ${eventTitle}`;

    const copyPasteMessage = `Quick vote for "${eventTitle}". Best/Maybe/No: ${pollLink}`;

    const htmlContent = `
      <div style="text-align:center;">
        <img src="https://plan.setthedate.app/images/setthedate-logo.png" width="180" style="border-radius:16px;" alt="Set The Date" />
      </div>

      <p>Hi ${safeName},</p>

      <p><strong>Next step:</strong> share your poll so people can vote.</p>

      <p style="text-align:center;margin:18px 0;">
        <a href="${sharePageLink}"
           style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;">
          Open share page
        </a>
      </p>

      <p style="margin-top:18px;"><strong>Or copy this voting link into WhatsApp:</strong><br/>
        <a href="${pollLink}" style="font-size:16px;color:#2563eb;">${pollLink}</a>
      </p>

      <p style="margin-top:18px;"><strong>Copy/paste message:</strong><br/>
        ${escapeHtml(copyPasteMessage)}
      </p>

      <p style="margin-top:18px;">
        <strong>Edit later (if needed):</strong><br/>
        <a href="${editLink}">Edit your poll</a>
      </p>

      <p style="margin-top:18px;">We’ll email you when someone votes.</p>

      <p>Set The Date Team</p>
    `;

    const textContent = [
      `Hi ${firstName},`,
      ``,
      `Next step: share your poll so people can vote.`,
      ``,
      `Open share page:`,
      `${sharePageLink}`,
      ``,
      `Or copy this voting link into WhatsApp:`,
      `${pollLink}`,
      ``,
      `Copy/paste message:`,
      copyPasteMessage,
      ``,
      `Edit later (if needed):`,
      editLink,
      ``,
      `We’ll email you when someone votes.`,
      ``,
      `Set The Date Team`,
    ].join('\n');

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Set The Date', email: 'hello@setthedate.app' },
        replyTo: { name: 'Set The Date', email: 'hello@setthedate.app' },
        to: [{ email, name: firstName }],
        subject,
        htmlContent,
        textContent,
      }),
    });

    return res.status(200).json({ message: 'Organiser share email sent.' });
  } catch (error) {
    console.error('Error sending organiser email:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
