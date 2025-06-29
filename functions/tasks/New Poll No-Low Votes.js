// functions/tasks/New Poll No-Low Votes.js

const serverFetch = require('../lib/serverFetch');
const { db, FieldValue } = require('../lib/firebase');
const { differenceInHours } = require('date-fns');

/**
 * Reminds organiser if their poll is 24–120h old and no one but them has voted.
 * Sends up to two reminders, spaced at least 48h apart.
 */
module.exports = async function newPollNoLowVotesTask() {
  console.log('🔔 Running newPollNoLowVotesTask...');

  try {
    const now = new Date();
    const pollsSnap = await db.collection('polls').get();

    for (const pollDoc of pollsSnap.docs) {
      const pollId   = pollDoc.id;
      const data     = pollDoc.data();
      const createdAt  = data.createdAt?.toDate?.() || new Date(0);
      const lastRem    = data.lastLowVotesReminder?.toDate?.() || new Date(0);
      const ageHrs     = differenceInHours(now, createdAt);
      const sinceLast  = differenceInHours(now, lastRem);

      // Only consider polls 24–120 hours old
      if (ageHrs < 24 || ageHrs > 120) continue;

      const sentCount = data.lowVotesReminderCount || 0;
      // Max two reminders, spacing at least 48h
      if (sentCount >= 2) continue;
      if (sentCount === 1 && sinceLast < 48) continue;

      // Check for any non-organiser votes
      const votesSnap = await db
        .collection('polls').doc(pollId)
        .collection('votes').get();

      const nonOrgVotes = votesSnap.docs.filter(
        vd => vd.data().email !== data.organiserEmail
      );
      if (nonOrgVotes.length > 0) continue;

      // Send the reminder via the custom API endpoint
      await serverFetch('/api/emailNewPollNoLowVotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organiserEmail: data.organiserEmail,
          organiserFirstName: data.organiserFirstName,
          eventTitle: data.eventTitle,
          pollId,
          editToken: data.editToken,
          reminderCount: sentCount, // 0 = first reminder, 1 = second, etc.
        }),
      });

      // Record that we sent a reminder
      await db.collection('polls').doc(pollId).update({
        lowVotesReminderCount:   sentCount + 1,
        lastLowVotesReminder:    FieldValue.serverTimestamp(),
      });

      console.log(`✅ Sent low/no votes reminder #${sentCount + 1} to ${data.organiserEmail} for poll ${pollId}`);
    }
  } catch (err) {
    console.error('❌ Error in newPollNoLowVotesTask:', err);
  }
};
