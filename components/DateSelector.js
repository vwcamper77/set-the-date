// components/DateSelector.js
import { format } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

export default function DateSelector({ selectedDates, setSelectedDates }) {
  const isFriday = (date) => date.getDay() === 5;

  return (
    <div className="text-center mt-4">
      <DayPicker
        mode="multiple"
        selected={selectedDates}
        onSelect={setSelectedDates}
        disabled={{ before: new Date() }} // 🚫 Disable past dates
        modifiers={{
          friday: isFriday
        }}
        modifiersClassNames={{
          friday: 'text-blue-600 font-bold'
        }}
      />

      <div className="mt-4 text-left">
        <strong>Selected dates:</strong>
        <ul className="list-disc pl-4">
          {selectedDates?.map((date, i) => (
            <li key={i}>
              {format(date, 'EEEE do MMMM yyyy')}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
