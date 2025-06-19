const checkVotesAndNotifyOrganiserTask = require('./tasks/checkVotesAndNotifyOrganiserTask');
exports.checkVotesAndNotifyOrganiser = onSchedule(
  { schedule: 'every day 10:00', timeZone: 'Europe/London' },
  async () => {
    await checkVotesAndNotifyOrganiserTask();
  }
);
