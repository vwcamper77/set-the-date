const functions = require('firebase-functions');
const checkVotesAndNotifyOrganiserTask = require('./tasks/checkVotesAndNotifyOrganiserTask');
const pollClosedTakeActionReminderTask = require('./tasks/pollClosedTakeActionReminderTask');
const finalisePollAnnouncementTask = require('./tasks/finalisePollAnnouncementTask');

exports.checkVotesAndNotifyOrganiser = functions.pubsub
  .schedule('0 10 * * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    return checkVotesAndNotifyOrganiserTask();
  });

exports.pollClosedTakeActionReminder = functions.pubsub
  .schedule('0 18 * * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    return pollClosedTakeActionReminderTask();
  });

exports.finalisePollAnnouncement = functions.pubsub
  .schedule('10 10 * * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    return finalisePollAnnouncementTask();
  });
