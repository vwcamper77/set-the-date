// components/DateSelector.js
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
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
            today: 'text-purple-700 font-bold',
          }}
          numberOfMonths={isHoliday ? 2 : 1}
          className="mx-auto"
          styles={{
            root: {
              margin: '0 auto',
              display: 'block',
              width: 'fit-content',
              maxWidth: `${calendarMaxWidth}px`,
            },
            months: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1.25rem',
              justifyContent: 'center',
              maxWidth: `${calendarMaxWidth}px`,
              margin: '0 auto',
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
