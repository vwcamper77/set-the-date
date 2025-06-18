// pages/api/resendCorrectEditLinks.js
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
    // Limit to 3 polls per run to avoid timeout
    const limitedPolls = pollsSnap.docs.slice(0, 3);

    let sent = 0;

    // Map over limited polls to create an array of promises
    const emailPromises = limitedPolls.map(async (pollDoc) => {
      const poll = pollDoc.data();

      if (!poll.organiserEmail || !poll.editToken || !poll.eventTitle || !poll.createdAt) {
        console.log(`Skipping poll ${pollDoc.id} due to missing data.`);
        return;
      }

      const createdAt = poll.createdAt.toDate ? poll.createdAt.toDate() : new Date(poll.createdAt);
      const ageInDays = differenceInDays(now, createdAt);

      const firstName = poll.organiserFirstName || 'there';

      let subject = `Just checking in – here's your link to manage “${poll.eventTitle}”`;
      let htmlContent = `
        <p>Hi ${firstName},</p>
        <p>This is Gavin – I’m the founder of <strong>Set The Date</strong>. Just wanted to make sure you have the correct private link to manage your event:</p>
        <p><a href="https://plan.setthedate.app/edit/${pollDoc.id}?token=${poll.editToken}" style="font-size:16px;">🔗 Open your event dashboard</a></p>
        <p>If you need any help – extending the deadline, choosing the final date, or just figuring out next steps – feel free to reply directly. I’m always happy to help!</p>
        <p>Best wishes,<br/>
        Gavin<br/>
        Founder, Set The Date<br/>
        <a href="mailto:hello@setthedate.app">hello@setthedate.app</a></p>
      `;

      if (ageInDays > 14) {
        subject = `Manage or extend your “${poll.eventTitle}” event`;
        htmlContent = `
          <p>Hi ${firstName},</p>
          <p>We’re just checking in — your event “${poll.eventTitle}” was created a little while ago.</p>
          <p>If you’d like to keep planning, you can extend the deadline or update details anytime here:</p>
          <p><a href="https://plan.setthedate.app/edit/${pollDoc.id}?token=${poll.editToken}" style="font-size:16px;">🔗 Manage your event</a></p>
          <p>No action needed if your plans have changed. 😊</p>
          <p>– The Set The Date Team</p>
        `;
      }

      try {
        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'Set The Date', email: 'noreply@setthedate.app' },
            to: [{ email: poll.organiserEmail }],
            replyTo: { email: 'hello@setthedate.app' },
            subject,
            htmlContent,
          }),
        });

        console.log(`✅ Resent correct link to ${poll.organiserEmail}`);
        sent++;
      } catch (error) {
        console.error(`❌ Failed sending email to ${poll.organiserEmail}:`, error);
      }
    });

    await Promise.all(emailPromises);

    res.status(200).json({ message: `Resent emails with edit links to ${sent} organisers.` });
  } catch (err) {
    console.error('❌ Failed to resend edit links:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
