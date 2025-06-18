// /api/resendCorrectEditLinks.js
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  try {
    const pollsSnap = await getDocs(collection(db, 'polls'));
    let sent = 0;

    for (const pollDoc of pollsSnap.docs) {
      const poll = pollDoc.data();

      if (!poll.organiserEmail || !poll.editToken) continue;

      const editUrl = `https://plan.setthedate.app/edit/${pollDoc.id}?token=${poll.editToken}`;
      const subject = `Here’s your link to manage “${poll.eventTitle}”`;
      const htmlContent = `
        <p>Hi ${poll.organiserFirstName || 'there'},</p>
        <p>You may have received an earlier email with a broken link. Here is your correct private link to manage your event:</p>
        <p><a href="${editUrl}" style="font-size:16px;">🔗 Open your event dashboard</a></p>
        <p>Thanks for using Set The Date!</p>
      `;

      const baseUrl = `https://${req.headers.host}`;
      await fetch(`${baseUrl}/api/sendOrganiserEmail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: poll.organiserEmail,
          subject,
          htmlContent,
        }),
      });

      console.log(`✅ Resent correct link to ${poll.organiserEmail}`);
      sent++;
    }

    res.status(200).json({ message: `Resent ${sent} emails with edit links.` });
  } catch (err) {
    console.error('❌ Failed to resend edit links:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
