// Expire calendar days at local midnight, consistent with the date picker.
export function isUnavailableEventDate(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date < today;
}

export function currentEventVotes(votes, dates, now = new Date()) {
  return Object.fromEntries(dates.filter(date => !isUnavailableEventDate(date, now))
    .map(date => [date, votes[date]]));
}
