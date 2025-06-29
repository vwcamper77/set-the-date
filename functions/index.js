const functions = require('firebase-functions');
const newPollNoLowVotesTask = require('./tasks/New Poll No-Low Votes');
const pollClosingNext24hrsReminderTask = require('./tasks/Poll Closing Next 24hrs Reminder');
const pollClosedFinaliseAndSetTheDateTask = require('./tasks/Poll Closed Finalise and Set The Date');

exports.newPollNoLowVotes = functions.pubsub
  .schedule('0 10 * * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    return newPollNoLowVotesTask();
  });

exports.pollClosingNext24hrsReminder = functions.pubsub
  .schedule('0 18 * * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    return pollClosingNext24hrsReminderTask();
  });

exports.pollClosedFinaliseAndSetTheDate = functions.pubsub
  .schedule('10 10 * * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    return pollClosedFinaliseAndSetTheDateTask();
  });
