import { addDays, format, parseISO, startOfDay } from 'date-fns';

function calendarDate(value) {
  if (typeof value?.toDate === 'function') value = value.toDate();
  else if (typeof value?.seconds === 'number') value = new Date(value.seconds * 1000);
  const date = typeof value === 'string' ? parseISO(value) : value instanceof Date ? value : null;
  return date && !Number.isNaN(date.getTime()) ? startOfDay(date) : null;
}

function getTripWindow(poll) {
  const values = poll?.dates?.length ? poll.dates : poll?.selectedDates;
  const dates = (Array.isArray(values) ? values : []).map(calendarDate).filter(Boolean).sort((a, b) => a - b);
  if (!dates.length) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}

function getRemainingRange(start, end, now = new Date()) {
  const from = calendarDate(start);
  const to = calendarDate(end);
  const today = startOfDay(now);
  if (!from || !to || from > to || to < today) return null;
  return { start: from < today ? today : from, end: to };
}

function getTripAvailability(poll, now = new Date()) {
  if (calendarDate(poll?.finalDate)) return null;
  const window = getTripWindow(poll);
  if (!window) return null;
  const rawPadding = poll?.eventOptions?.flexiblePaddingDays;
  const padding = typeof rawPadding === 'number' && Number.isFinite(rawPadding) && rawPadding >= 0
    ? Math.min(rawPadding, 14) : 2;
  return getRemainingRange(addDays(window.start, -padding), addDays(window.end, padding), now);
}

function getTripAvailabilityMessage(poll, now = new Date()) {
  const finalDate = calendarDate(poll?.finalDate);
  if (finalDate) return `Trip date confirmed: ${format(finalDate, 'EEE d MMM yyyy')}. Availability collection is closed.`;
  if (getTripAvailability(poll, now)) return 'Availability is open — add the travel dates that work for you.';
  return getTripWindow(poll)
    ? 'This travel window has ended. Ask the organiser to update the dates.'
    : 'The organiser needs to set a valid travel window.';
}

function clampTripRange(range, poll, now = new Date()) {
  const available = getTripAvailability(poll, now);
  const from = calendarDate(range?.from);
  const to = calendarDate(range?.to);
  if (!available || !from || !to) return null;
  const start = from < available.start ? available.start : from;
  const end = to > available.end ? available.end : to;
  return start <= end ? { from: start, to: end } : null;
}

export { calendarDate, getTripWindow, getRemainingRange, getTripAvailability, getTripAvailabilityMessage, clampTripRange };
