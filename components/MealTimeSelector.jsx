// components/MealTimeSelector.jsx
import { useMemo } from 'react';

const ORDERED_MEALS = ['breakfast', 'lunch', 'dinner', 'evening'];
const LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  evening: 'Evening out',
};

export default function MealTimeSelector({
  value = [],
  onChange,
  disabled = false,
  direction = 'row', // 'row' | 'col'
  allowEvening = true,
}) {
  const ordered = useMemo(
    () => ORDERED_MEALS.filter((meal) => allowEvening || meal !== 'evening'),
    [allowEvening]
  );

  const toggle = (key) => {
    const set = new Set(value);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    onChange(Array.from(set));
  };

  return (
    <div className={direction === 'col' ? 'flex flex-col gap-2' : 'flex items-center gap-4'}>
      {ordered.map((key) => (
        <label key={key} className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.includes(key)}
            onChange={() => toggle(key)}
            disabled={disabled}
          />
          {LABELS[key]}
        </label>
      ))}
    </div>
  );
}
