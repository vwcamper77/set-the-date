const pollClosedReminderTask = require('./tasks/pollClosedReminderTask');
exports.pollClosedTakeActionReminder = onSchedule(
  { schedule: 'every day 18:00', timeZone: 'Europe/London' },
  async () => {
    await pollClosedReminderTask();
  }
);
