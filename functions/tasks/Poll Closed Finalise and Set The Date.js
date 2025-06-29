// functions/tasks/Poll Closed Finalise and Set The Date.js

const serverFetch = require('../lib/serverFetch');
const { db, FieldValue } = require('../lib/firebase');

module.exports = async function pollClosedFinaliseAndSetTheDateTask() {
  console.log('🔔 Running pollClosedFinaliseAndSetTheDateTask...');

  try {
    const now = new Date();
    const pollsSnap = await db.collection('polls').get();

    for (const pollDoc of pollsSnap.docs) {
      const pollId = pollDoc.id;
      const data = pollDoc.data();

      // Only consider polls with a deadline in the past, not finalised, and not already reminded
      if (data.finalDate) continue;
      if (!data.deadline?.toDate) continue;

      const deadline = data.deadline.toDate();
      if (deadline > now) continue;

      if (data.postDeadlineReminderSent) continue;

      // Must have organiser contact details
      if (!data.organiserEmail || !data.editToken) continue;

      // Send reminder via your REST endpoint
      await serverFetch('/api/emailPollClosedFinaliseSetTheDate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organiserEmail: data.organiserEmail,
          organiserFirstName: data.organiserFirstName,
          eventTitle: data.eventTitle,
          location: data.location,
          pollId,
          editToken: data.editToken
        }),
      });

      // Mark reminder as sent in Firestore
      await db.collection('polls').doc(pollId).update({
        postDeadlineReminderSent: true,
        postDeadlineReminderCount: (data.postDeadlineReminderCount || 0) + 1,
        lastPostDeadlineReminder: FieldValue.serverTimestamp(),
      });

      console.log(`✅ Sent post-deadline reminder for poll ${pollId}`);
    }

    console.log(`📨 Completed poll closed reminders.`);
  } catch (err) {
    console.error('❌ Error in pollClosedFinaliseAndSetTheDateTask:', err);
  }
};
