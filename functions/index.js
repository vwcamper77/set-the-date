// ✅ functions/index.js
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');

const checkVotesAndNotifyOrganiserTask = require('./tasks/checkVotesAndNotifyOrganiserTask');
const pollClosedTakeActionReminderTask = require('./tasks/pollClosedTakeActionReminderTask');
const finalisePollAnnouncementTask = require('./tasks/finalisePollAnnouncementTask');

// 🔔 Runs every day at 10:00 to nudge organisers with no votes
exports.checkVotesAndNotifyOrganiser = onSchedule(
  {
    schedule: 'every day 10:00',
    timeZone: 'Europe/London',
  },
  async () => {
    await checkVotesAndNotifyOrganiserTask();
  }
);

// 📅 Runs every day at 18:00 to remind organisers when the poll deadline has passed
exports.pollClosedTakeActionReminder = onSchedule(
  {
    schedule: 'every day 18:00',
    timeZone: 'Europe/London',
  },
  async () => {
    await pollClosedTakeActionReminderTask();
  }
);

// 📣 Runs every day at 10:10 to announce finalised event date to attendees
exports.finalisePollAnnouncement = onSchedule(
  {
    schedule: 'every day 10:10',
    timeZone: 'Europe/London',
  },
  async () => {
    await finalisePollAnnouncementTask();
  }
);

