'use strict';

function getHolidayCutoff(referenceDate = new Date()) {
  const now = new Date(referenceDate);
  const year = now.getFullYear();
  // December is month 11 (0-indexed). Use local timezone so users see the holiday treatment until the end of Dec 25.
  return new Date(year, 11, 25, 23, 59, 59, 999);
}

export function isHolidaySeason(referenceDate = new Date()) {
  const now = new Date(referenceDate);
  return now <= getHolidayCutoff(now);
}

export function holidaySeasonBoundaries(referenceDate = new Date()) {
  const now = new Date(referenceDate);
  const cutoff = getHolidayCutoff(now);
  return {
    year: now.getFullYear(),
    until: cutoff,
  };
}
