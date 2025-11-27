// components/FinalisePollActions.jsx
import { useState, useMemo } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, parseISO } from 'date-fns';

const ALL_MEALS = [
  'breakfast',
  'brunch',
  'coffee',
  'lunch',
  'lunch_drinks',
  'afternoon_tea',
  'dinner',
  'evening',
];
const MEAL_LABELS = {
  breakfast: 'Breakfast',
  brunch: 'Brunch',
  coffee: 'Coffee',
  lunch: 'Lunch',
  lunch_drinks: 'Lunch drinks',
  afternoon_tea: 'Afternoon tea',
  dinner: 'Dinner',
  evening: 'Drinks',
};

function dayKey(iso) {
  return (iso || '').slice(0, 10);
}

function enabledMealsForDate(poll, dateISO) {
  const key = dayKey(dateISO);
  const perDate = poll?.eventOptions?.mealTimesPerDate?.[key];
  if (Array.isArray(perDate) && perDate.length) {
    return ALL_MEALS.filter(m => perDate.includes(m));
  }
  const global =
    Array.isArray(poll?.eventOptions?.mealTimes) && poll.eventOptions.mealTimes.length
      ? poll.eventOptions.mealTimes
      : ALL_MEALS;
  return ALL_MEALS.filter(m => global.includes(m));
}

const FALLBACK_MEAL_PRIORITY = [
  'dinner',
  'evening',
  'afternoon_tea',
  'lunch_drinks',
  'lunch',
  'brunch',
  'coffee',
  'breakfast',
];

function preferDinnerEveningLunchBreakfast(options) {
  for (const option of FALLBACK_MEAL_PRIORITY) {
    if (options.includes(option)) return option;
  }
  return null;
}

export default function FinalisePollActions({
  poll,
  suggestedDate,
  suggestedMeal, // computed on Results page
  onFinalised,   // optional callback
}) {
  const [saving, setSaving] = useState(false);

  const mealOptionsForSuggestedDate = useMemo(() => {
    if (!poll || !suggestedDate || (poll.eventType || 'general') !== 'meal') return [];
    const enabled = enabledMealsForDate(poll, suggestedDate);
    // organiser can only choose among enabled meals
    return enabled;
  }, [poll, suggestedDate]);

  const [finalMeal, setFinalMeal] = useState(() => {
    if ((poll?.eventType || 'general') !== 'meal') return '';
    if (!suggestedMeal || suggestedMeal === 'either') {
      const fallback = preferDinnerEveningLunchBreakfast(mealOptionsForSuggestedDate);
      return fallback || '';
    }
    return mealOptionsForSuggestedDate.includes(suggestedMeal)
      ? suggestedMeal
      : preferDinnerEveningLunchBreakfast(mealOptionsForSuggestedDate) || '';
  });

  const [finalDate] = useState(suggestedDate || '');

  const isMealEvent = (poll?.eventType || 'general') === 'meal';
  const dateLabel = finalDate ? format(parseISO(finalDate), 'EEEE do MMMM yyyy') : '';

  const canLock =
    !!finalDate &&
    (!isMealEvent || (isMealEvent && finalMeal && mealOptionsForSuggestedDate.includes(finalMeal)));

  const handleLock = async () => {
    if (!canLock || !poll?.id) return;
    try {
      setSaving(true);
      const ref = doc(db, 'polls', poll.id);
      await updateDoc(ref, {
        finalDate,
        ...(isMealEvent ? { finalMeal } : {}),
        finalisedAt: serverTimestamp(),
      });

      // optional: ping your existing notify function so attendees get the “final plan” email
      // If you already handle this in /edit page, you can skip this.
      try {
        await fetch('/api/notifyAttendees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pollId: poll.id,
            type: 'finalised',
            finalDate,
            finalMeal: isMealEvent ? finalMeal : null,
            eventTitle: poll.eventTitle || '',
            location: poll.location || '',
            organiser: poll.organiserFirstName || poll.organiserName || poll.organiser || 'Organiser',
          }),
        });
      } catch (_) {}

      if (onFinalised) onFinalised({ finalDate, finalMeal: isMealEvent ? finalMeal : null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <h3 className="font-semibold mb-2">Lock in the plan</h3>
      <p className="text-sm text-gray-700 mb-3">
        We suggest <strong>{dateLabel}</strong>
        {isMealEvent && finalMeal ? ` — ${finalMeal}` : ''}. You can override before locking.
      </p>

      {isMealEvent && mealOptionsForSuggestedDate.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Choose meal for {dateLabel}
          </label>
          <select
            className="border rounded px-3 py-2 text-sm w-full md:w-auto"
            value={finalMeal}
            onChange={(e) => setFinalMeal(e.target.value)}
          >
            {mealOptionsForSuggestedDate.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABELS[m] || m}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-600 mt-2">
            If votes were split or "either" was common, dinner wins by default, then drinks, afternoon tea, lunch drinks, lunch, brunch, coffee, then breakfast.
          </p>
        </div>
      )}

      <button
        onClick={handleLock}
        disabled={!canLock || saving}
        className={`w-full md:w-auto px-4 py-2 rounded font-semibold text-white ${canLock ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'}`}
      >
        {saving ? 'Locking...' : 'Lock in final date'}
      </button>
    </div>
  );
}
