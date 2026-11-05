import { differenceInCalendarDays } from 'date-fns';
import { getTripWindow, getTripAvailability } from './tripDates.mjs';

function getPollStatus(poll, now = new Date()) {
  const window = getTripWindow(poll);
  if (window) {
    const remaining = poll?.eventType === 'holiday' ? getTripAvailability(poll, now) : null;
    // A trip's first date opens a window; it is not the date the entire trip expires.
    const plannedDate = poll?.eventType === 'holiday'
      ? remaining ? (window.start > now ? window.start : remaining.start) : window.end
      : window.start;
    const daysUntil = differenceInCalendarDays(plannedDate, now);
    const label = daysUntil < 0 ? 'Passed' : daysUntil === 0 ? 'Live' : daysUntil <= 10 ? 'Upcoming' : 'Planning';
    return { label, daysUntil, sortValue: daysUntil };
  }
  const deadline = poll?.deadline;
  const date = deadline?.toDate ? deadline.toDate()
    : deadline?.seconds != null ? new Date(deadline.seconds * 1000)
    : deadline ? new Date(deadline) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { label: 'Unknown', daysUntil: null, sortValue: Number.POSITIVE_INFINITY };
  }
  return date < now
    ? { label: 'Passed', daysUntil: null, sortValue: Number.NEGATIVE_INFINITY }
    : { label: 'Planning', daysUntil: null, sortValue: Number.POSITIVE_INFINITY };
}

export { getPollStatus };
