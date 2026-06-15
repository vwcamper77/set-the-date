import { isBefore, startOfDay, startOfToday } from 'date-fns';

export const normalizeCalendarDate = (value) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return startOfDay(value);
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return startOfDay(date);
  }

  return null;
};

export const isPastCalendarDate = (value) => {
  const normalized = normalizeCalendarDate(value);
  if (!normalized) return false;
  return isBefore(normalized, startOfToday());
};

export const hasPastCalendarDates = (values = []) =>
  Array.isArray(values) && values.some((value) => isPastCalendarDate(value));

export const normalizeSelectedDateArray = (values = []) => {
  if (!Array.isArray(values)) {
    return { dates: [], removedPastDates: false };
  }

  const dates = [];
  const seen = new Set();
  let removedPastDates = false;

  values.forEach((value) => {
    const normalized = normalizeCalendarDate(value);
    if (!normalized) return;

    if (isPastCalendarDate(normalized)) {
      removedPastDates = true;
      return;
    }

    const key = normalized.getTime();
    if (seen.has(key)) return;
    seen.add(key);
    dates.push(normalized);
  });

  return { dates, removedPastDates };
};
