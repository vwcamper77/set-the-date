const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const checkVotesAndNotifyOrganiserTask = require('./tasks/checkVotesAndNotifyOrganiserTask');
const pollClosedTakeActionReminderTask = require('./tasks/pollClosedTakeActionReminderTask');
const finalisePollAnnouncementTask = require('./tasks/finalisePollAnnouncementTask');

// 1. Check for low votes every day at 10:00 London time
exports.checkVotesAndNotifyOrganiser = functions.pubsub
  .schedule('every day 10:00')
  .timeZone('Europe/London')
  .onRun(checkVotesAndNotifyOrganiserTask);

// 2. Remind organiser to act after poll closes
exports.pollClosedTakeActionReminder = functions.pubsub
  .schedule('every day 10:30')
  .timeZone('Europe/London')
  .onRun(pollClosedTakeActionReminderTask);

// 3. Announce final date to attendees
exports.finalisePollAnnouncement = functions.pubsub
  .schedule('every day 11:00')
  .timeZone('Europe/London')
  .onRun(finalisePollAnnouncementTask);
