import { differenceInCalendarDays } from 'date-fns';
import { calendarDate, getTripWindow, getTripAvailability } from './tripDates.mjs';

function getPollStatus(poll, now = new Date()) {
  const finalDate = calendarDate(poll?.finalDate);
  if (finalDate) {
    const end = poll?.eventType === 'holiday' ? calendarDate(poll?.finalEndDate) : null;
    const lastDay = end && end >= finalDate ? end : finalDate;
    const daysUntilStart = differenceInCalendarDays(finalDate, now);
    const daysUntil = daysUntilStart <= 0 && differenceInCalendarDays(lastDay, now) >= 0 ? 0 : differenceInCalendarDays(daysUntilStart > 0 ? finalDate : lastDay, now);
    const label = daysUntil < 0 ? 'Passed' : daysUntil === 0 ? 'Live' : 'Upcoming';
    return { label, daysUntil, sortValue: daysUntil };
  }
  const window = getTripWindow(poll);
  if (window) {
    if (poll?.eventType === 'holiday') {
      // Availability is a planning window, never confirmation that a trip is happening.
      const remaining = getTripAvailability(poll, now);
      return remaining
        ? { label: 'Planning', daysUntil: null, sortValue: differenceInCalendarDays(remaining.start, now) }
        : { label: 'Passed', daysUntil: differenceInCalendarDays(window.end, now), sortValue: differenceInCalendarDays(window.end, now) };
    }
    const plannedDate = window.start;
    const daysUntil = differenceInCalendarDays(plannedDate, now);
    const label = daysUntil < 0 ? 'Passed' : daysUntil === 0 ? 'Planning' : daysUntil <= 10 ? 'Upcoming' : 'Planning';
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
