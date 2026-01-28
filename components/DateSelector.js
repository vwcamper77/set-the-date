// components/DateSelector.js
import { useEffect, useMemo, useState } from 'react';
import { format, isSameDay, isWithinInterval, startOfDay } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

const fridayModifier = (date) => date.getDay() === 5;

const areRangesEqual = (a, b) => {
  if (!a?.from && !b?.from) return true;
  if ((a?.from && !b?.from) || (!a?.from && b?.from)) return false;
  if (a.from.getTime() !== b.from.getTime()) return false;
  if (!a?.to && !b?.to) return true;
  if ((a?.to && !b?.to) || (!a?.to && b?.to)) return false;
  return a.to.getTime() === b.to.getTime();
};

const parseDateOnly = (value) => {
  if (!value || typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const getStartOfDay = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return startOfDay(date);
};

const isPastDate = (value) => {
  const normalized = getStartOfDay(value);
  if (!normalized) return false;
  const today = getStartOfDay(new Date());
  return normalized < today;
};

export default function DateSelector({
  selectedDates,
  setSelectedDates,
  eventType,
  maxSelectableDates = null,
  onLimitReached,
  blockedRanges = [],
}) {
  const [range, setRange] = useState({ from: undefined, to: undefined });
  const [monthsToShow, setMonthsToShow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches ? 2 : 1,
  );
  const isHoliday = eventType === 'holiday';
  const monthWidth = monthsToShow === 2 ? 300 : 320;
  const monthGap = monthsToShow === 2 ? 32 : 0;
  const calendarMaxWidth = monthsToShow === 2 ? monthWidth * 2 + monthGap + 40 : monthWidth + 40;
  const monthGridTemplate = `repeat(${monthsToShow}, ${monthWidth}px)`;
  const rangeStart = range?.from ? new Date(range.from) : null;
  const rangeEnd = range?.to ? new Date(range.to) : null;
  const rangeStartTime = rangeStart?.getTime();
  const rangeEndTime = rangeEnd?.getTime();
  const hasCompleteRange =
    typeof rangeStartTime === 'number' &&
    !Number.isNaN(rangeStartTime) &&
    typeof rangeEndTime === 'number' &&
    !Number.isNaN(rangeEndTime) &&
    rangeEndTime >= rangeStartTime;

  useEffect(() => {
    const updateMonthsToShow = () => {
      if (typeof window === 'undefined') return;
      const showTwoMonths = window.matchMedia('(min-width: 900px)').matches;
      const next = showTwoMonths ? 2 : 1;
      setMonthsToShow((current) => (current === next ? current : next));
    };

    updateMonthsToShow();
    window.addEventListener('resize', updateMonthsToShow);
    return () => window.removeEventListener('resize', updateMonthsToShow);
  }, []);

  useEffect(() => {
    if (!isHoliday) {
      if (range.from || range.to) {
        setRange({ from: undefined, to: undefined });
      }
      return;
    }

    if (!selectedDates?.length) {
      if (range.from || range.to) {
        setRange({ from: undefined, to: undefined });
      }
      return;
    }

    const sorted = selectedDates.slice().sort((a, b) => a - b);
    const nextRange = {
      from: sorted[0],
      to: sorted[sorted.length - 1],
    };
    if (!areRangesEqual(range, nextRange)) {
      setRange(nextRange);
    }
  }, [isHoliday, selectedDates]);

  useEffect(() => {
    if (!Array.isArray(selectedDates) || selectedDates.length === 0) return;
    const next = selectedDates.filter((date) => !isPastDate(date));
    if (next.length === selectedDates.length) return;
    setSelectedDates(next);
  }, [selectedDates, setSelectedDates]);

  const blockedMatchers = useMemo(() => {
    if (!Array.isArray(blockedRanges) || !blockedRanges.length) return [];
    return blockedRanges
      .map((range) => {
        if (!range?.start || !range?.end) return null;
        const from = parseDateOnly(range.start);
        const to = parseDateOnly(range.end);
        if (!from || !to) return null;
        return { from, to };
      })
      .filter(Boolean);
  }, [blockedRanges]);

  const blockedIntervals = useMemo(() => {
    if (!blockedMatchers.length) return [];
    return blockedMatchers.map((range) => ({
      start: range.from.getTime(),
      end: range.to.getTime(),
    }));
  }, [blockedMatchers]);

  const isBlockedDate = (date) => {
    if (!blockedIntervals.length) return false;
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    const time = normalized.getTime();
    return blockedIntervals.some((range) => time >= range.start && time <= range.end);
  };

  const handleSelect = (value) => {
    if (isHoliday) {
      const normalized = value || { from: undefined, to: undefined };
      if (!normalized?.from) {
        setRange(normalized);
        setSelectedDates([]);
        return;
      }

      const start = getStartOfDay(normalized.from);
      if (!start || isPastDate(start)) {
        setRange({ from: undefined, to: undefined });
        setSelectedDates([]);
        return;
      }

      if (normalized.to) {
        const end = getStartOfDay(normalized.to);
        if (!end || isPastDate(end)) {
          setRange({ from: start, to: undefined });
          setSelectedDates([start]);
          return;
        }

        if (end < start) {
          setRange(normalized);
          setSelectedDates([start]);
          return;
        }

        setRange(normalized);
        setSelectedDates([start, end]);
        return;
      }

      setRange(normalized);
      setSelectedDates([start]);
      return;
    }

    const next = (value || []).filter((date) => !isPastDate(date));
    if (maxSelectableDates && next.length > maxSelectableDates) {
      if (typeof onLimitReached === 'function') {
        onLimitReached(maxSelectableDates);
      }
      return;
    }

    setSelectedDates(next);
  };

  const selectedForPicker = isHoliday ? range : selectedDates;
  const mode = isHoliday ? 'range' : 'multiple';

  return (
    <div className="mt-4 flex flex-col items-center w-full">
      <div className="flex justify-center w-full">
        <DayPicker
          mode={mode}
          selected={selectedForPicker}
          onSelect={handleSelect}
          weekStartsOn={1}
          disabled={(date) => isPastDate(date)}
          modifiers={{
            friday: fridayModifier,
            saturday: (date) => date.getDay() === 6,
            sunday: (date) => date.getDay() === 0,
            weekdayFri: (date) => date.getDay() === 5,
            weekdaySat: (date) => date.getDay() === 6,
            weekdaySun: (date) => date.getDay() === 0,
            blocked: isBlockedDate,
            tripStart: (date) => (rangeStart ? isSameDay(date, rangeStart) : false),
            tripEnd: (date) => (rangeEnd ? isSameDay(date, rangeEnd) : false),
            tripMiddle: (date) =>
              hasCompleteRange &&
              isWithinInterval(date, { start: rangeStart, end: rangeEnd }) &&
              !isSameDay(date, rangeStart) &&
              !isSameDay(date, rangeEnd),
            today: (date) => {
              const now = new Date();
              return (
                date.getFullYear() === now.getFullYear() &&
                date.getMonth() === now.getMonth() &&
                date.getDate() === now.getDate()
              );
            },
          }}
          modifiersClassNames={{
            friday: 'text-blue-600 font-semibold',
            saturday: 'text-blue-600 font-semibold',
            sunday: 'text-blue-600 font-semibold',
            weekdayFri: 'text-blue-600 font-semibold',
            weekdaySat: 'text-blue-600 font-semibold',
            weekdaySun: 'text-blue-600 font-semibold',
            blocked: 'line-through text-slate-400 opacity-70',
            tripStart:
              'bg-blue-600 border border-blue-600 text-white font-semibold rounded-full shadow-sm ring-2 ring-blue-300',
            tripEnd:
              'border-2 border-blue-700 text-blue-700 font-semibold bg-white rounded-full shadow-sm ring-2 ring-blue-200',
            tripMiddle:
              'bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-semibold',
            today: 'text-purple-700 font-bold',
          }}
          modifiersStyles={{
            blocked: { textDecoration: 'line-through' },
          }}
          numberOfMonths={monthsToShow}
          className="mx-auto w-full"
          styles={{
            root: {
              margin: '0 auto',
              display: 'flex',
              justifyContent: 'center',
              width: '100%',
              maxWidth: `${calendarMaxWidth}px`,
            },
            months: {
              display: 'grid',
              gridTemplateColumns: monthGridTemplate,
              gap: `${monthGap}px`,
              justifyContent: 'center',
              justifyItems: 'center',
              width: 'fit-content',
            },
            month: {
              justifySelf: 'center',
              width: `${monthWidth}px`,
            },
            caption: { textAlign: 'center' },
          }}
        />
      </div>

      <div className="mt-4 w-full flex justify-center">
        <div className="w-full max-w-lg text-left">
          <strong>{isHoliday ? 'Selected window:' : 'Selected dates:'}</strong>
          {isHoliday ? (
            <p className="mt-2 text-sm">
              {range?.from
                ? `${format(range.from, 'EEEE do MMMM yyyy')}${
                    range?.to ? ` to ${format(range.to, 'EEEE do MMMM yyyy')}` : ''
                  }`
                : 'Pick your ideal start and end dates.'}
            </p>
          ) : (
            <ul className="list-disc pl-4 text-sm">
              {selectedDates?.map((date, index) => (
                <li key={index}>{format(date, 'EEEE do MMMM yyyy')}</li>
              ))}
              {!selectedDates?.length && (
                <li className="list-none text-gray-500">Select at least one date.</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
