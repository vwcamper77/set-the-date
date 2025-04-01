// pages/api/notifyOrganiserOnVote.js
import { db } from '@/lib/firebase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { organiserEmail, organiserName, eventTitle, pollId, voterName, votes, message } = req.body;

  if (!organiserEmail || !organiserName || !pollId || !voterName || !votes) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const resultsUrl = `https://plan.eveningout.social/results/${pollId}`;

  const formattedVotes = Object.entries(votes)
    .map(([date, val]) => {
      const symbol = val === 'yes' ? '✅' : val === 'maybe' ? '🤔' : '❌';
      const label = val === 'yes' ? 'Can Attend' : val === 'maybe' ? 'Maybe' : 'No';
      return `${symbol} ${date} – ${label}`;
    })
    .join('<br />');

  const htmlContent = `
    <p>Hi ${organiserName},</p>
    <p><strong>${voterName}</strong> just submitted their vote for your "<strong>${eventTitle}</strong>" poll.</p>
    <p><strong>Votes:</strong><br />${formattedVotes}</p>
    ${message ? `<p><strong>Message from ${voterName}:</strong><br />${message}</p>` : ''}
    <p><a href="${resultsUrl}" style="font-size: 16px; color: #007bff;">View Full Results</a></p>
    <br />
    <p>– The Evening Out Team</p>
  `;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Evening Out', email: 'noreply@eveningout.social' },
        to: [{ email: organiserEmail, name: organiserName }],
        subject: `🎉 New vote on your "${eventTitle}" event!`,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to send notification email. Status: ${response.status} - ${errorText}`);
    }

    res.status(200).json({ message: 'Notification email sent to organiser.' });
  } catch (error) {
    console.error('Error sending vote notification:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
