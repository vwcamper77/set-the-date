// components/DateSelector.js
import { useEffect, useState } from 'react';
import { eachDayOfInterval, format } from 'date-fns';
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

export default function DateSelector({ selectedDates, setSelectedDates, eventType }) {
  const [range, setRange] = useState({ from: undefined, to: undefined });
  const isHoliday = eventType === 'holiday';

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

      if (normalized.from && normalized.to) {
        setSelectedDates(eachDayOfInterval({ start: normalized.from, end: normalized.to }));
        return;
      }

      setSelectedDates([normalized.from]);
      return;
    }

    setSelectedDates(value || []);
  };

  const selectedForPicker = isHoliday ? range : selectedDates;
  const mode = isHoliday ? 'range' : 'multiple';

  return (
    <div className="text-center mt-4">
      <DayPicker
        mode={mode}
        selected={selectedForPicker}
        onSelect={handleSelect}
        disabled={{ before: new Date() }}
        modifiers={{
          friday: fridayModifier,
        }}
        modifiersClassNames={{
          friday: 'text-blue-600 font-bold',
        }}
        numberOfMonths={isHoliday ? 2 : 1}
      />

      <div className="mt-4 text-left">
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
  );
}
