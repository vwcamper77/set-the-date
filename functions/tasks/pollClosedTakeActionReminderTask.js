// functions/tasks/pollClosedTakeActionReminderTask.js

const fetch = require('node-fetch'); // npm install node-fetch@2
const { db, FieldValue } = require('../lib/firebase'); // assumes FieldValue export if needed

/**
 * Sends a reminder to organisers if their poll deadline has passed,
 * no final date is selected, and they haven't already been reminded.
 */
module.exports = async function pollClosedTakeActionReminderTask() {
  console.log('📅 Running pollClosedTakeActionReminderTask...');

  try {
    const now = new Date();
    const pollsSnap = await db.collection('polls').get(); // ✅ admin.firestore()

    let notified = 0;

    for (const pollDoc of pollsSnap.docs) {
      const poll = pollDoc.data();
      const pollId = pollDoc.id;

      // Skip if already finalised
      if (poll.finalDate) continue;

      // Skip if no deadline or deadline still in the future
      const deadline = poll.deadline?.toDate?.() || null;
      if (!deadline || deadline > now) continue;

      // Skip if we've already sent a post-deadline reminder
      if (poll.postDeadlineReminderSent) continue;

      // Must have organiser contact details
      if (!poll.organiserEmail || !poll.editToken) continue;

      // Send reminder email via your API route
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/emailPostDeadlineReminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organiserEmail: poll.organiserEmail,
          organiserName: poll.organiserFirstName || 'Organizer',
          eventTitle: poll.eventTitle || 'Your event',
          location: poll.location || 'somewhere',
          pollId,
          editToken: poll.editToken
        }),
      });

      // Mark reminder as sent in Firestore
      await db.collection('polls').doc(pollId).update({
        postDeadlineReminderSent: true,
        postDeadlineReminderCount: (poll.postDeadlineReminderCount || 0) + 1,
        lastPostDeadlineReminder: FieldValue.serverTimestamp(),
      });

      notified++;
      console.log(`📧 Sent post-deadline reminder for poll ${pollId}`);
    }

    console.log(`📨 Completed: ${notified} organisers notified.`);
  } catch (err) {
    console.error('❌ Error in pollClosedTakeActionReminderTask:', err);
  }
};
