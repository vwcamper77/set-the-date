import { addDays, format, parseISO } from 'date-fns';

const escapeIcsValue = (value) =>
  (value || '')
    .toString()
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .trim();

const slugifyForFilename = (value) =>
  (value || 'set-the-date-event')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '') || 'set-the-date-event';

export default function AddToCalendar({
  eventDate,
  eventTitle,
  eventLocation,
  description,
  introText = 'Add this date to your calendar',
  className = '',
}) {
  if (!eventDate) return null;

  const parsedDate = parseISO(eventDate);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const formattedStart = format(parsedDate, 'yyyyMMdd');
  const formattedEnd = format(addDays(parsedDate, 1), 'yyyyMMdd');
  const safeTitle = (eventTitle || 'Set The Date event').trim();
  const safeLocation = (eventLocation || 'Set The Date event').trim();
  const safeDetails =
    (description || `Confirmed plans for ${safeTitle}.`).trim();

  const googleCalendarUrl = [
    'https://calendar.google.com/calendar/render',
    '?action=TEMPLATE',
    `&text=${encodeURIComponent(safeTitle)}`,
    `&details=${encodeURIComponent(safeDetails)}`,
    `&location=${encodeURIComponent(safeLocation)}`,
    `&dates=${formattedStart}/${formattedEnd}`,
  ].join('');

  const dtStamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
  const icsBody = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Set The Date//EN',
    'BEGIN:VEVENT',
    `UID:setthedate-${formattedStart}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${formattedStart}`,
    `DTEND;VALUE=DATE:${formattedEnd}`,
    `SUMMARY:${escapeIcsValue(safeTitle)}`,
    `DESCRIPTION:${escapeIcsValue(safeDetails)}`,
    `LOCATION:${escapeIcsValue(safeLocation)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(
    icsBody
  )}`;
  const fileName = `${slugifyForFilename(safeTitle)}.ics`;

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm space-y-3 ${className}`}
    >
      <div className="space-y-0.5 text-left">
        <p className="text-sm font-semibold text-slate-900">{introText}</p>
        <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">
          Compatible with Google Calendar, Apple Calendar, and Outlook.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          target="_blank"
          rel="noreferrer"
          href={googleCalendarUrl}
          className="flex-1 min-w-[140px] items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-center text-[13px] font-semibold uppercase tracking-wide text-white shadow shadow-slate-900/30 transition hover:bg-slate-800"
        >
          Add to calendar
        </a>
        <a
          href={icsHref}
          download={fileName}
          className="flex-1 min-w-[140px] items-center justify-center rounded-lg border border-slate-900 px-3 py-1.5 text-center text-[13px] font-semibold uppercase tracking-wide text-slate-900 transition hover:bg-slate-900 hover:text-white"
        >
          Download ICS
        </a>
      </div>
    </div>
  );
}
