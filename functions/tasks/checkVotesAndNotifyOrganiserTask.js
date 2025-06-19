// ✅ 1. functions/tasks/checkVotesAndNotifyOrganiserTask.js
const { db } = require('../lib/firebase');
const { collection, getDocs, doc, updateDoc } = require('firebase/firestore');
const { differenceInHours } = require('date-fns');

module.exports = async function checkVotesAndNotifyOrganiserTask() {
  console.log('🔔 Running checkVotesAndNotifyOrganiserTask...');

  try {
    const now = new Date();
    const pollsSnap = await getDocs(collection(db, 'polls'));

    for (const pollDoc of pollsSnap.docs) {
      const pollData = pollDoc.data();
      const createdAt = pollData.createdAt?.toDate?.() || new Date(0);
      const lastReminder = pollData.lastLowVotesReminder?.toDate?.() || new Date(0);
      const age = differenceInHours(now, createdAt);
      const sinceLastReminder = differenceInHours(now, lastReminder);

      if (age < 24 || age > 120) continue;
      if (pollData.lowVotesReminderCount >= 2) continue;
      if (pollData.lowVotesReminderCount === 1 && sinceLastReminder < 48) continue;

      const votesSnap = await getDocs(collection(db, 'polls', pollDoc.id, 'votes'));
      const nonOrganiserVotes = votesSnap.docs.filter(
        doc => doc.data().email !== pollData.organiserEmail
      );

      if (nonOrganiserVotes.length > 0) continue;

      const editUrl = `https://plan.setthedate.app/edit/${pollDoc.id}?token=${pollData.editToken}`;
      const isSecondReminder = pollData.lowVotesReminderCount === 1;

      const subject = isSecondReminder
        ? `Still no responses? You can extend your event's deadline`
        : `Still waiting on your first votes?`;

      const htmlContent = isSecondReminder
        ? `
          <p>Hi ${pollData.organiserFirstName || 'there'},</p>
          <p>Your event "${pollData.eventTitle}" still hasn’t had any responses. You can always extend the deadline or change the dates to make it easier for people to respond.</p>
          <p><a href="${editUrl}" style="font-size:16px;">🔗 Manage or reshare your event</a></p>
          <p>Need any help? Just reply — I’m happy to support.</p>
          <p>Warm wishes,<br/>Gavin<br/>Founder, Set The Date</p>
        `
        : `
          <p>Hi ${pollData.organiserFirstName || 'there'},</p>
          <p>Your event "${pollData.eventTitle}" hasn’t had any responses yet. No worries — it happens!</p>
          <p><a href="${editUrl}" style="font-size:16px;">🔗 Share your event again</a></p>
          <p>Need help or have any questions? Just hit reply — I’d love to help.</p>
          <p>Warm wishes,<br/>Gavin<br/>Founder, Set The Date</p>
        `;

      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/sendOrganiserEmail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: pollData.organiserEmail,
          subject,
          htmlContent,
          sender: { name: 'Gavin at Set The Date', email: 'hello@setthedate.app' },
          replyTo: { name: 'Gavin', email: 'hello@setthedate.app' }
        }),
      });

      await updateDoc(doc(db, 'polls', pollDoc.id), {
        lowVotesReminderCount: (pollData.lowVotesReminderCount || 0) + 1,
        lastLowVotesReminder: new Date(),
      });

      console.log(`✅ Reminder sent to ${pollData.organiserEmail} for poll ${pollDoc.id}`);
    }
  } catch (err) {
    console.error('❌ Error checking votes:', err);
  }
};