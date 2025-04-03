import { parseISO, format } from 'date-fns';

export default function VoteCard({ date, vote, onChange }) {
  const parsed = parseISO(date);
  const formatted = format(parsed, 'EEEE do MMMM yyyy');

  return (
    <div className="border p-4 mb-4 rounded">
      <div className="font-semibold mb-2">{formatted}</div>
      <div className="flex justify-between items-center text-sm">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name={date}
            value="yes"
            checked={vote === 'yes'}
            onChange={() => onChange(date, 'yes')}
          /> ✅ Can Attend
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name={date}
            value="maybe"
            checked={vote === 'maybe'}
            onChange={() => onChange(date, 'maybe')}
          /> 🤔 Maybe
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name={date}
            value="no"
            checked={vote === 'no'}
            onChange={() => onChange(date, 'no')}
          /> ❌ No
        </label>
      </div>
    </div>
  );
}
