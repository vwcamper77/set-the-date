// functions/tasks/New Poll No-Low Votes.js

const serverFetch = require('../lib/serverFetch');
const { db, FieldValue } = require('../lib/firebase');
const { differenceInHours } = require('date-fns');

/**
 * Handles two organiser reminder states:
 * 1. Poll created but not shared yet
 * 2. Poll shared but still no non-organiser votes
 */
module.exports = async function newPollNoLowVotesTask() {
  console.log('🔔 Running newPollNoLowVotesTask...');

  try {
    const now = new Date();
    const pollsSnap = await db.collection('polls').get();
    const shareReminderThresholds = [2, 24, 48, 72];

    for (const pollDoc of pollsSnap.docs) {
      const pollId = pollDoc.id;
      const data = pollDoc.data();
      const createdAt = data.createdAt?.toDate?.() || new Date(0);
      const ageHrs = differenceInHours(now, createdAt);
      const deadlineAt = data.deadline?.toDate?.() || null;
      const deadlinePassed =
        deadlineAt instanceof Date && !Number.isNaN(deadlineAt.getTime()) && deadlineAt < now;

      if (data.finalDate || deadlinePassed) continue;

      // Check for any non-organiser votes
      const votesSnap = await db
        .collection('polls').doc(pollId)
        .collection('votes').get();

      const nonOrgVotes = votesSnap.docs.filter(
        vd => vd.data().email !== data.organiserEmail
      );
      if (nonOrgVotes.length > 0) continue;

      const shareStatus = data.shareStatus === 'shared' ? 'shared' : 'not_shared';
      const shareCount = Number.isFinite(Number(data.shareCount)) ? Number(data.shareCount) : 0;
      const shareReminderCount = Number.isFinite(Number(data.shareReminderCount))
        ? Number(data.shareReminderCount)
        : 0;
      const lastShareReminderAt = data.lastShareReminderSentAt?.toDate?.() || null;
      const hoursSinceShareReminder =
        lastShareReminderAt instanceof Date && !Number.isNaN(lastShareReminderAt.getTime())
          ? differenceInHours(now, lastShareReminderAt)
          : null;
      const nextShareThreshold = shareReminderThresholds[shareReminderCount] ?? null;
      const needsUnsharedReminder =
        shareStatus !== 'shared' &&
        shareCount === 0 &&
        shareReminderCount < 4 &&
        typeof nextShareThreshold === 'number' &&
        ageHrs >= nextShareThreshold &&
        (shareReminderCount === 0 || (hoursSinceShareReminder !== null && hoursSinceShareReminder >= 20));

      if (needsUnsharedReminder) {
        await serverFetch('/api/emailUnsharedPollReminder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organiserEmail: data.organiserEmail,
            organiserFirstName: data.organiserFirstName,
            eventTitle: data.eventTitle,
            pollId,
            editToken: data.editToken || null,
            reminderNumber: shareReminderCount + 1,
          }),
        });

        await db.collection('polls').doc(pollId).update({
          shareReminderCount: shareReminderCount + 1,
          lastShareReminderSentAt: FieldValue.serverTimestamp(),
        });

        console.log(`✅ Sent unshared poll reminder #${shareReminderCount + 1} to ${data.organiserEmail} for poll ${pollId}`);
        continue;
      }

      // Low/no-vote reminders only apply after the organiser has shared the poll.
      if (shareStatus !== 'shared') continue;
      if (ageHrs < 24 || ageHrs > 120) continue;

      const lastLowVotesReminder = data.lastLowVotesReminder?.toDate?.() || new Date(0);
      const sinceLowVotesReminder = differenceInHours(now, lastLowVotesReminder);
      const lowVotesReminderCount = Number.isFinite(Number(data.lowVotesReminderCount))
        ? Number(data.lowVotesReminderCount)
        : 0;

      if (lowVotesReminderCount >= 2) continue;
      if (lowVotesReminderCount === 1 && sinceLowVotesReminder < 48) continue;

      await serverFetch('/api/emailNewPollNoLowVotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organiserEmail: data.organiserEmail,
          organiserFirstName: data.organiserFirstName,
          eventTitle: data.eventTitle,
          pollId,
          editToken: data.editToken,
          reminderCount: lowVotesReminderCount,
        }),
      });

      await db.collection('polls').doc(pollId).update({
        lowVotesReminderCount: lowVotesReminderCount + 1,
        lastLowVotesReminder: FieldValue.serverTimestamp(),
      });

      console.log(`✅ Sent low/no votes reminder #${lowVotesReminderCount + 1} to ${data.organiserEmail} for poll ${pollId}`);
    }
  } catch (err) {
    console.error('❌ Error in newPollNoLowVotesTask:', err);
  }
};
