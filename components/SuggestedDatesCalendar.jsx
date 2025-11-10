import { useMemo } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const toMonthBuckets = (dates) => {
  if (!dates.length) return [];

  const buckets = [];
  let cursor = startOfMonth(dates[0]);
  const finalMonth = startOfMonth(dates[dates.length - 1]);

  while (cursor <= finalMonth) {
    buckets.push(cursor);
    cursor = addMonths(cursor, 1);
  }

  return buckets;
};

const normalizeDates = (dates) =>
  dates
    .map((value) => {
      if (!value) return null;
      try {
        const parsed = typeof value === 'string' ? parseISO(value) : new Date(value);
        return Number.isNaN(parsed?.getTime()) ? null : parsed;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a - b);

export default function SuggestedDatesCalendar({ dates }) {
  const parsedDates = useMemo(() => normalizeDates(dates || []), [dates]);
  const highlightedDates = useMemo(() => {
    return new Set(parsedDates.map((date) => format(date, 'yyyy-MM-dd')));
  }, [parsedDates]);
  const months = useMemo(() => toMonthBuckets(parsedDates), [parsedDates]);
  const visibleMonths = months.slice(0, 2);
  const overflowCount = Math.max(0, months.length - visibleMonths.length);

  if (!parsedDates.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/60 p-4 text-center text-sm text-slate-500">
        Add dates to show them on a calendar preview.
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-inner shadow-slate-900/5 flex flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-1">Calendar</p>
        <p className="text-sm text-slate-600">Highlighted days show the options you picked.</p>
      </div>

      <div className="grid gap-4">
        {visibleMonths.map((month) => {
          const rangeStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
          const rangeEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
          const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

          return (
            <div key={month.toISOString()}>
              <p className="text-center text-sm font-semibold text-slate-700 mb-1">
                {format(month, 'LLLL yyyy')}
              </p>
              <div className="grid grid-cols-7 gap-1 text-[11px] text-slate-500 mb-1">
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label} className="text-center">
                    {label}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day) => {
                  const key = format(day, 'yyyy-MM-dd');
                  const isHighlighted = highlightedDates.has(key);
                  const inActiveMonth = isSameMonth(day, month);
                  return (
                    <div
                      key={key}
                      className={`h-10 rounded-xl border text-sm flex items-center justify-center transition ${
                        isHighlighted
                          ? 'bg-emerald-300/70 border-emerald-600 text-emerald-900 font-semibold shadow-inner shadow-emerald-700/20'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      } ${inActiveMonth ? '' : 'opacity-30'}`}
                    >
                      {format(day, 'd')}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {overflowCount > 0 && (
        <p className="text-xs text-center text-slate-500">
          +{overflowCount} more month{overflowCount > 1 ? 's' : ''} of dates
        </p>
      )}
    </div>
  );
}
