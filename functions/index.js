const functions = require('firebase-functions');

// ✅ Use filenames with NO SPACES and match exactly
const newPollNoLowVotesTask = require('./tasks/newPollNoLowVotes');
const pollClosingNext24hrsReminderTask = require('./tasks/pollClosingNext24hrsReminder');
const pollClosedFinaliseAndSetTheDateTask = require('./tasks/pollClosedFinaliseAndSetTheDate');
const syncRentalsIcalTask = require('./tasks/syncRentalsIcal');

// ⏰ Cron: new polls with no votes
exports.newPollNoLowVotes = functions.pubsub
  .schedule('0 10 * * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    return newPollNoLowVotesTask();
  });

// ⏰ Cron: polls closing in 24hrs
exports.pollClosingNext24hrsReminder = functions.pubsub
  .schedule('0 18 * * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    return pollClosingNext24hrsReminderTask();
  });

// ⏰ Cron: polls closed, send finalise reminder
exports.pollClosedFinaliseAndSetTheDate = functions.pubsub
  .schedule('10 10 * * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    return pollClosedFinaliseAndSetTheDateTask();
  });

// Cron: rentals iCal availability sync
exports.syncRentalsIcal = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    return syncRentalsIcalTask();
  });
