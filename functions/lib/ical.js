const DATE_ONLY_REGEX = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME_REGEX = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/;

const toDateOnly = (date) => {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  value.setHours(0, 0, 0, 0);
  return value;
};

const formatDateOnly = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addMonths = (date, months) => {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
};

const unfoldIcalLines = (icalText) => {
  const rawLines = icalText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines = [];
  rawLines.forEach((line) => {
    if (!line) return;
    if (line.startsWith(' ') || line.startsWith('\t')) {
      const prev = lines.pop() || '';
      lines.push(prev + line.trimStart());
    } else {
      lines.push(line.trim());
    }
  });
  return lines;
};

const parseIcalValue = (value) => {
  const trimmed = value.trim();
  const dateOnlyMatch = trimmed.match(DATE_ONLY_REGEX);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    return { date: new Date(year, month, day), isDateOnly: true };
  }

  const dateTimeMatch = trimmed.match(DATE_TIME_REGEX);
  if (dateTimeMatch) {
    const year = Number(dateTimeMatch[1]);
    const month = Number(dateTimeMatch[2]) - 1;
    const day = Number(dateTimeMatch[3]);
    const hour = Number(dateTimeMatch[4]);
    const minute = Number(dateTimeMatch[5]);
    const second = Number(dateTimeMatch[6]);
    return { date: new Date(year, month, day, hour, minute, second), isDateOnly: false };
  }

  const fallback = new Date(trimmed);
  if (Number.isNaN(fallback.getTime())) {
    return null;
  }
  return { date: fallback, isDateOnly: false };
};

const parseEventRange = (lines) => {
  let startLine = null;
  let endLine = null;
  let cancelled = false;

  lines.forEach((line) => {
    if (line.startsWith('DTSTART')) startLine = line;
    if (line.startsWith('DTEND')) endLine = line;
    if (line.startsWith('STATUS:CANCELLED')) cancelled = true;
  });

  if (!startLine || cancelled) return null;
  const startValue = startLine.split(':').slice(1).join(':');
  const endValue = endLine ? endLine.split(':').slice(1).join(':') : '';

  const startParsed = parseIcalValue(startValue);
  if (!startParsed) return null;

  const endParsed = endValue ? parseIcalValue(endValue) : null;
  const isAllDay =
    startLine.includes('VALUE=DATE') || startParsed.isDateOnly || (endLine && endLine.includes('VALUE=DATE'));

  let startDate = toDateOnly(startParsed.date);
  let endDate = endParsed ? toDateOnly(endParsed.date) : startDate;

  if (isAllDay) {
    if (endParsed) {
      endDate = addDays(endDate, -1);
    }
  } else if (endParsed) {
    const endTime = endParsed.date;
    if (
      endTime.getHours() === 0 &&
      endTime.getMinutes() === 0 &&
      endTime.getSeconds() === 0 &&
      endTime.getMilliseconds() === 0 &&
      endDate.getTime() > startDate.getTime()
    ) {
      endDate = addDays(endDate, -1);
    }
  }

  if (endDate.getTime() < startDate.getTime()) {
    endDate = startDate;
  }

  return { start: formatDateOnly(startDate), end: formatDateOnly(endDate) };
};

const clipRangesToWindow = (ranges, windowStart, windowEnd) => {
  return ranges
    .map((range) => {
      const start = parseIcalValue(range.start.replace(/-/g, ''));
      const end = parseIcalValue(range.end.replace(/-/g, ''));
      if (!start || !end) return null;
      let startDate = toDateOnly(start.date);
      let endDate = toDateOnly(end.date);
      if (endDate < windowStart || startDate > windowEnd) return null;
      if (startDate < windowStart) startDate = windowStart;
      if (endDate > windowEnd) endDate = windowEnd;
      return { start: formatDateOnly(startDate), end: formatDateOnly(endDate) };
    })
    .filter(Boolean);
};

const mergeDateRanges = (ranges) => {
  if (!Array.isArray(ranges) || !ranges.length) return [];
  const sorted = ranges
    .map((range) => {
      const start = parseIcalValue(range.start.replace(/-/g, ''));
      const end = parseIcalValue(range.end.replace(/-/g, ''));
      if (!start || !end) return null;
      return {
        start: toDateOnly(start.date),
        end: toDateOnly(end.date),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  sorted.forEach((range) => {
    if (!merged.length) {
      merged.push({ ...range });
      return;
    }
    const current = merged[merged.length - 1];
    const nextStart = range.start.getTime();
    const currentEnd = current.end.getTime();
    const adjacent = nextStart <= addDays(current.end, 1).getTime();
    if (adjacent) {
      if (range.end.getTime() > currentEnd) {
        current.end = range.end;
      }
    } else {
      merged.push({ ...range });
    }
  });

  return merged.map((range) => ({
    start: formatDateOnly(range.start),
    end: formatDateOnly(range.end),
  }));
};

const parseIcalToBlockedRanges = (icalText, options = {}) => {
  const { monthsAhead = 18 } = options;
  const lines = unfoldIcalLines(icalText || '');
  const events = [];
  let buffer = null;

  lines.forEach((line) => {
    if (line === 'BEGIN:VEVENT') {
      buffer = [];
      return;
    }
    if (line === 'END:VEVENT') {
      if (buffer) {
        const range = parseEventRange(buffer);
        if (range) {
          events.push(range);
        }
      }
      buffer = null;
      return;
    }
    if (buffer) {
      buffer.push(line);
    }
  });

  const today = toDateOnly(new Date());
  const windowEnd = toDateOnly(addMonths(today, monthsAhead));
  const clipped = clipRangesToWindow(events, today, windowEnd);
  return mergeDateRanges(clipped);
};

module.exports = {
  parseIcalToBlockedRanges,
  mergeDateRanges,
};
