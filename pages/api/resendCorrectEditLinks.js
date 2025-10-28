// /api/resendCorrectEditLinks.js
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { differenceInDays } from 'date-fns';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  try {
    const now = new Date();
    const pollsSnap = await getDocs(collection(db, 'polls'));
    let sent = 0;

    for (const pollDoc of pollsSnap.docs) {
      const poll = pollDoc.data();

      if (!poll.organiserEmail || !poll.editToken || !poll.eventTitle || !poll.createdAt) continue;

      const createdAt = poll.createdAt.toDate ? poll.createdAt.toDate() : new Date(poll.createdAt);
      const ageInDays = differenceInDays(now, createdAt);

      const baseUrl = `https://${req.headers.host}`;
      const firstName = poll.organiserFirstName || 'there';
      const editUrl = `https://plan.setthedate.app/edit/${pollDoc.id}?token=${poll.editToken}`;

      let subject = `Here’s your link to manage “${poll.eventTitle}”`;
      let htmlContent = `
        <p>Hi ${firstName},</p>
        <p>You may have received an earlier email with a broken link. Here is your correct private link to manage your event:</p>
        <p><a href="${editUrl}" style="font-size:16px;">🔗 Open your event dashboard</a></p>
        <p>Thanks for using Set The Date!</p>
        <p>Warm wishes,<br/>Gavin<br/>Founder, Set The Date</p>
      `;

      if (ageInDays > 14) {
        subject = `Manage or extend your “${poll.eventTitle}” event`;
        htmlContent = `
          <p>Hi ${firstName},</p>
          <p>We’re just checking in — your event “${poll.eventTitle}” was created a little while ago.</p>
          <p>If you’d like to keep planning, you can extend the deadline or update details anytime here:</p>
          <p><a href="${editUrl}" style="font-size:16px;">🔗 Manage your event</a></p>
          <p>No action needed if your plans have changed. 😊</p>
          <p>Warm wishes,<br/>Gavin<br/>Founder, Set The Date</p>
        `;
      }

      await fetch(`${baseUrl}/api/sendOrganiserEmail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: poll.organiserEmail,
          subject,
          htmlContent,
          sender: { name: 'Gavin at Set The Date', email: 'hello@setthedate.app' },
          replyTo: { name: 'Gavin', email: 'hello@setthedate.app' }
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
