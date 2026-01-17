// /api/notifyPollClosingSoon.js
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  const now = new Date();
  const oneDayAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  try {
    const pollsSnap = await getDocs(collection(db, 'polls'));
    let notifiedCount = 0;

    for (const pollDoc of pollsSnap.docs) {
      const poll = pollDoc.data();
      const pollId = pollDoc.id;

      if (!poll.deadline?.toDate) continue;
      const deadline = poll.deadline.toDate();

      const timeDiff = Math.abs(deadline - oneDayAhead);
      const withinWindow = timeDiff < 60 * 60 * 1000; // ±1 hour
      if (!withinWindow || poll.finalDate) continue;

      const votesSnap = await getDocs(collection(db, 'polls', pollId, 'votes'));
      const allVoters = votesSnap.docs.map(doc => doc.data());

      const allEmails = new Set();
      allVoters.forEach(v => {
        if (v.email) allEmails.add(v.email);
      });

      const shareLink = `https://plan.setthedate.app/poll/${pollId}`;

      // Notify organiser
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/sendOrganiserEmail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: poll.organiserEmail,
          subject: `⏳ 24 Hours Left to Finalise Votes for "${poll.eventTitle}"`,
          htmlContent: `
            <p>Hi ${poll.organiserFirstName || 'there'},</p>
            <p>Your event <strong>"${poll.eventTitle}"</strong> is closing for votes in 24 hours.</p>
            <p>Some attendees might not have voted yet. You can quickly remind them here:</p>
            <p><a href="${shareLink}" style="font-size:16px;">🔗 Share the poll again</a></p>
            <p>Warm wishes,<br/>Team, Set The Date</p>
          `,
          sender: { name: 'Team at Set The Date', email: 'hello@setthedate.app' },
          replyTo: { name: 'Set The Date Team', email: 'hello@setthedate.app' }
        }),
      });

      // Notify attendees who have email addresses
      for (const vote of allVoters) {
        if (!vote.email) continue;
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/sendAttendeeEmail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: vote.email,
            subject: `⏳ Last Chance to Vote for "${poll.eventTitle}"`,
            htmlContent: `
              <p>Hi ${vote.name || 'there'},</p>
              <p>This is a quick reminder — the voting deadline for <strong>"${poll.eventTitle}"</strong> is less than 24 hours away.</p>
              <p>If you haven’t voted yet, please do so here:</p>
              <p><a href="${shareLink}" style="font-size:16px;">✅ Cast your vote</a></p>
              <p>If you know someone who hasn’t seen the poll, feel free to pass this on!</p>
              <p>Warm wishes,<br/>Set The Date Team<br/>Founder, Set The Date</p>
            `,
            sender: { name: 'Team at Set The Date', email: 'hello@setthedate.app' },
            replyTo: { name: 'Set The Date Team', email: 'hello@setthedate.app' }
          }),
        });
      }

      notifiedCount++;
    }

    res.status(200).json({ message: `Polls notified: ${notifiedCount}` });
  } catch (err) {
    console.error('❌ Error in notifyPollClosingSoon:', err);
    res.status(500).json({ error: 'Failed to notify about closing polls' });
  }
}
