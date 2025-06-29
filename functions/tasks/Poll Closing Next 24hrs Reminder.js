// functions/tasks/Poll Closing Next 24hrs Reminder.js

const serverFetch = require('../lib/serverFetch');
const { db, FieldValue } = require('../lib/firebase');

module.exports = async function pollClosingNext24hrsReminderTask() {
  console.log('🔔 Running pollClosingNext24hrsReminderTask...');

  try {
    const now = new Date();
    const pollsSnap = await db.collection('polls').get();

    for (const pollDoc of pollsSnap.docs) {
      const pollId = pollDoc.id;
      const data = pollDoc.data();

      // Only consider open polls (no finalDate and has a deadline)
      if (data.finalDate) continue;
      if (!data.deadline?.toDate) continue;

      const deadline = data.deadline.toDate();
      const timeToDeadline = (deadline - now) / (1000 * 60 * 60); // hours left

      // Only send if deadline is within next 24 hours (but not in the past)
      if (timeToDeadline > 24 || timeToDeadline <= 0) continue;

      // Only send if we haven't already sent a closing soon reminder
      if (data.closingSoonReminderSent) continue;

      // Only send if there are less than 3 votes (excluding organiser)
      const votesSnap = await db
        .collection('polls').doc(pollId)
        .collection('votes').get();

      const nonOrgVotes = votesSnap.docs.filter(
        vd => vd.data().email !== data.organiserEmail
      );
      if (nonOrgVotes.length >= 3) continue;

      // Send reminder via the custom API endpoint
      await serverFetch('/api/emailPollClosing24hrReminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organiserEmail: data.organiserEmail,
          organiserFirstName: data.organiserFirstName,
          eventTitle: data.eventTitle,
          pollId,
          editToken: data.editToken,
          deadline: deadline.toISOString(),
          votesCount: nonOrgVotes.length
        }),
      });

      // Mark that reminder has been sent
      await db.collection('polls').doc(pollId).update({
        closingSoonReminderSent: true,
        lastClosingSoonReminder: FieldValue.serverTimestamp(),
      });

      console.log(`✅ Sent closing soon reminder to ${data.organiserEmail} for poll ${pollId}`);
    }
  } catch (err) {
    console.error('❌ Error in pollClosingNext24hrsReminderTask:', err);
  }
};
