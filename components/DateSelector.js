// components/DateSelector.js
import { useEffect, useState } from 'react';
import { format, isSameDay, isWithinInterval } from 'date-fns';
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

export default function DateSelector({
  selectedDates,
  setSelectedDates,
  eventType,
  maxSelectableDates = null,
  onLimitReached,
}) {
  const [range, setRange] = useState({ from: undefined, to: undefined });
  const isHoliday = eventType === 'holiday';
  const calendarMaxWidth = isHoliday ? 720 : 420;
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

  const handleSelect = (value) => {
    if (isHoliday) {
      const normalized = value || { from: undefined, to: undefined };
      setRange(normalized);

      if (!normalized?.from) {
        setSelectedDates([]);
        return;
      }

      const start = new Date(normalized.from);
      start.setHours(0, 0, 0, 0);

      if (normalized.to) {
        const end = new Date(normalized.to);
        end.setHours(0, 0, 0, 0);

        if (end < start) {
          setSelectedDates([start]);
          return;
        }

        setSelectedDates([start, end]);
        return;
      }

      setSelectedDates([start]);
      return;
    }

    const next = value || [];
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
          disabled={{ before: new Date() }}
          weekStartsOn={1}
          modifiers={{
            friday: fridayModifier,
            saturday: (date) => date.getDay() === 6,
            sunday: (date) => date.getDay() === 0,
            weekdayFri: (date) => date.getDay() === 5,
            weekdaySat: (date) => date.getDay() === 6,
            weekdaySun: (date) => date.getDay() === 0,
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
            tripStart:
              'bg-blue-600 border border-blue-600 text-white font-semibold rounded-full shadow-sm ring-2 ring-blue-300',
            tripEnd:
              'border-2 border-blue-700 text-blue-700 font-semibold bg-white rounded-full shadow-sm ring-2 ring-blue-200',
            tripMiddle:
              'bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-semibold',
            today: 'text-purple-700 font-bold',
          }}
          numberOfMonths={isHoliday ? 2 : 1}
          className="mx-auto w-full"
          styles={{
            root: {
              margin: '0 auto',
              display: 'block',
              width: '100%',
              maxWidth: `${calendarMaxWidth}px`,
            },
          months: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.25rem',
            justifyContent: 'center',
            justifyItems: 'center',
            width: '100%',
          },
          month: {
            justifySelf: 'center',
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
