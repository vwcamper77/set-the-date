import brevo from '@/lib/brevo';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  const {
    organiserEmail,
    organiserName,
    pollId,
    eventTitle,
    message,
    editToken,
  } = req.body;

  if (!organiserEmail || !pollId || !editToken) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const editLink = `https://setthedate.app/edit/${pollId}?token=${editToken}`;

  try {
    await brevo.contacts.sendTransacEmail({
      sender: {
        name: 'Set The Date',
        email: 'noreply@setthedate.app',
      },
      to: [{ email: organiserEmail }],
      subject: `Someone sent a suggestion for "${eventTitle}"`,
      htmlContent: `
        <div style="font-family: sans-serif; padding: 20px;">
          <img src="https://setthedate.app/images/email-logo.png" alt="Set The Date" style="height: 60px; margin-bottom: 20px;" />
          <h2>Hi ${organiserName || ''},</h2>
          <p>You received a suggestion for your event <strong>${eventTitle}</strong>:</p>
          <blockquote style="border-left: 3px solid #ccc; margin: 1em 0; padding-left: 1em; color: #555;">
            ${message}
          </blockquote>
          <p>You can edit the event here:</p>
          <a href="${editLink}" style="display: inline-block; background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin-top: 10px;">
            ✏️ Edit Your Event
          </a>
          <hr style="margin: 30px 0;">
          <small style="color: #999;">If you didn’t request this, you can ignore this email.</small>
        </div>
      `,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Failed to send suggestion email:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
}
