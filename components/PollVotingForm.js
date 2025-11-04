import { useState, useEffect, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import {
  collection,
  setDoc,
  getDocs,
  doc,
  serverTimestamp,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

const KNOWN_MEALS = ['breakfast', 'lunch', 'dinner'];
const DEFAULT_MEALS = ['lunch', 'dinner']; // fallback when organiser didn't set options
const MEAL_LABELS = {
  breakfast: '🥐 Breakfast works',
  lunch: '🥪 Lunch works',
  dinner: '🍽️ Dinner works',
};

const dayKey = (iso) => (iso || '').slice(0, 10);

function enabledMealsForDate(poll, dateISO) {
  const key = dayKey(dateISO);
  const perDate = poll?.eventOptions?.mealTimesPerDate?.[key];
  if (Array.isArray(perDate) && perDate.length) {
    return perDate.filter((meal) => KNOWN_MEALS.includes(meal));
  }
  const globalSource =
    Array.isArray(poll?.eventOptions?.mealTimes) && poll.eventOptions.mealTimes.length
      ? poll.eventOptions.mealTimes
      : DEFAULT_MEALS;
  return globalSource.filter((meal) => KNOWN_MEALS.includes(meal));
}

const emptySelection = () => ({ yes: [], maybe: [] });

function normaliseMealSelection(raw, allowedMeals = KNOWN_MEALS) {
  const allowed = Array.isArray(allowedMeals) ? allowedMeals.filter(Boolean) : [];
  if (!allowed.length) return emptySelection();

  const yesSet = new Set();
  const maybeSet = new Set();

  const collect = (input, targetSet) => {
    if (Array.isArray(input)) {
      input.forEach((meal) => {
        if (allowed.includes(meal)) targetSet.add(meal);
      });
      return;
    }
    if (typeof input === 'string' && allowed.includes(input)) {
      targetSet.add(input);
    }
  };

  if (Array.isArray(raw)) {
    collect(raw, yesSet);
  } else if (raw && typeof raw === 'object') {
    collect(raw.yes ?? raw.definite ?? [], yesSet);
    collect(raw.maybe ?? raw.tentative ?? [], maybeSet);
  }

  const yes = allowed.filter((meal) => yesSet.has(meal));
  const maybe = allowed.filter((meal) => maybeSet.has(meal) && !yesSet.has(meal));

  return { yes, maybe };
}

function selectionsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const yesA = Array.isArray(a.yes) ? a.yes : [];
  const yesB = Array.isArray(b.yes) ? b.yes : [];
  const maybeA = Array.isArray(a.maybe) ? a.maybe : [];
  const maybeB = Array.isArray(b.maybe) ? b.maybe : [];
  if (yesA.length !== yesB.length || maybeA.length !== maybeB.length) return false;
  for (let i = 0; i < yesA.length; i += 1) {
    if (yesA[i] !== yesB[i]) return false;
  }
  for (let i = 0; i < maybeA.length; i += 1) {
    if (maybeA[i] !== maybeB[i]) return false;
  }
  return true;
}

const cloneSelection = (selection) => ({
  yes: [...(selection?.yes ?? [])],
  maybe: [...(selection?.maybe ?? [])],
});

const hasMealSelections = (selection) => {
  const yes = Array.isArray(selection?.yes) ? selection.yes.length : 0;
  const maybe = Array.isArray(selection?.maybe) ? selection.maybe.length : 0;
  return yes + maybe > 0;
};

export default function PollVotingForm({ poll, pollId, organiser, eventTitle }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [votes, setVotes] = useState({});
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  const [existingVotes, setExistingVotes] = useState([]);
  const [nameWarning, setNameWarning] = useState('');
  const [mealPreferences, setMealPreferences] = useState({});
  const [holidayEarliest, setHolidayEarliest] = useState('');
  const [holidayLatest, setHolidayLatest] = useState('');
  const [holidayDuration, setHolidayDuration] = useState('');
  const hasPrefilledExistingVote = useRef(false);

  const eventType = poll?.eventType || 'general';
  const mealMode = poll?.eventOptions?.mealMode
    ? (poll.eventOptions.mealMode === 'BLD' ? 'BLD' : 'LD')
    : (Array.isArray(poll?.eventOptions?.mealTimes) && poll.eventOptions.mealTimes.includes('breakfast')
        ? 'BLD'
        : 'LD');
  const isBLD = mealMode === 'BLD';

  useEffect(() => {
    const fetchExistingVotes = async () => {
      const voteSnap = await getDocs(collection(db, 'polls', pollId, 'votes'));
      const allVotes = voteSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExistingVotes(allVotes);
    };
    fetchExistingVotes();
  }, [pollId]);

  useEffect(() => {
    if (!poll?.dates) return;
    setVotes(prev => {
      let changed = false;
      const next = { ...prev };
      poll.dates.forEach(date => {
        if (!next[date]) {
          next[date] = 'yes';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [poll?.dates]);

  useEffect(() => {
    const normalized = name.trim().toLowerCase();
    const nameExists = existingVotes.some(v => v.name?.trim().toLowerCase() === normalized);
    if (!email && normalized && nameExists) {
      setNameWarning(
        `⚠️ Someone has already voted as "${name}". If that’s not you, add an initial.<br /><span class='text-green-600 font-semibold'>If it is you, please go ahead and make a change — your previous vote will be updated.</span>`
      );
    } else {
      setNameWarning('');
    }
  }, [name, email, existingVotes]);

  useEffect(() => {
    const normalizedName = name.trim().toLowerCase();
    const existingVote = existingVotes.find(v =>
      v.email?.toLowerCase() === email.trim().toLowerCase() ||
      (!email && v.name?.trim().toLowerCase() === normalizedName)
    );
    if (existingVote && !email) {
      setMessage('');
      setVotes({});
      setMealPreferences({});
      setHolidayEarliest('');
      setHolidayLatest('');
      setHolidayDuration('');
    }
  }, [email, name, existingVotes]);

  // Initialise meal selections so every attending voter has at least one slot ticked.
  useEffect(() => {
    if (eventType !== 'meal' || !poll?.dates?.length) return;

    setMealPreferences(prev => {
      let changed = false;
      const next = { ...prev };

      Object.keys(next).forEach(key => {
        if (!poll.dates.includes(key)) {
          delete next[key];
          changed = true;
        }
      });

      poll.dates.forEach(date => {
        const allowed = enabledMealsForDate(poll, date);
        const voteValue = votes[date];
        const stored = next[date];
        const current = normaliseMealSelection(stored, allowed);
        let target = cloneSelection(current);

        if (!allowed.length || voteValue === 'no') {
          const storedHasContent =
            Array.isArray(stored) ||
            hasMealSelections(stored);

          if (storedHasContent || hasMealSelections(current)) {
            next[date] = emptySelection();
            changed = true;
          }
          return;
        }

        if (!current.yes.length && !current.maybe.length) {
          if (voteValue === 'yes') {
            target = { yes: [allowed[0]], maybe: [] };
          } else if (voteValue === 'maybe') {
            target = { yes: [], maybe: [allowed[0]] };
          } else {
            target = { yes: [allowed[0]], maybe: [] };
          }
        } else {
          target = normaliseMealSelection(current, allowed);
        }

        const storedIsObject =
          stored && typeof stored === 'object' && !Array.isArray(stored);

        if (
          !storedIsObject ||
          !selectionsEqual(stored, target)
        ) {
          next[date] = cloneSelection(target);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [
    eventType,
    poll?.dates,
    poll?.eventOptions?.mealTimes,
    poll?.eventOptions?.mealTimesPerDate,
    mealMode,
    votes,
  ]);

  useEffect(() => {
    if (eventType !== 'holiday' || !poll?.dates?.length) return;
    setHolidayEarliest(prev => prev || poll.dates[0]);
    setHolidayLatest(prev => prev || poll.dates[poll.dates.length - 1]);
  }, [eventType, poll?.dates]);

  useEffect(() => {
    hasPrefilledExistingVote.current = false;
  }, [email]);

  useEffect(() => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || hasPrefilledExistingVote.current) return;
    const matched = existingVotes.find(v => v.email?.trim().toLowerCase() === normalizedEmail);
    if (!matched) return;

    if (matched.votes) setVotes(prev => ({ ...prev, ...matched.votes }));
    if (matched.message) setMessage(matched.message);
    if (eventType === 'meal' && matched.mealPreferences) {
      const normalised = {};
      (poll?.dates || []).forEach(date => {
        const allowed = enabledMealsForDate(poll, date);
        const raw = matched.mealPreferences[date];
        const selection = normaliseMealSelection(raw, allowed);
        if (selection.yes.length || selection.maybe.length) {
          normalised[date] = cloneSelection(selection);
        }
      });
      setMealPreferences(normalised);
    }
    if (eventType === 'holiday' && matched.holidayPreferences) {
      setHolidayEarliest(matched.holidayPreferences.earliestStart || '');
      setHolidayLatest(matched.holidayPreferences.latestEnd || '');
      setHolidayDuration(
        matched.holidayPreferences.maxDuration
          ? String(matched.holidayPreferences.maxDuration)
          : ''
      );
    }

    hasPrefilledExistingVote.current = true;
  }, [email, existingVotes, eventType]);

  const handleVoteChange = (date, value) => {
    setVotes(prev => ({ ...prev, [date]: value }));

    if (eventType !== 'meal') return;
    const allowed = enabledMealsForDate(poll, date);

    setMealPreferences(prev => {
      const current = normaliseMealSelection(prev[date], allowed);

      if (!allowed.length) {
        if (!prev[date]) return prev;
        const next = { ...prev };
        delete next[date];
        return next;
      }

      if (value === 'no') {
        const needsClear =
          Array.isArray(prev[date]) ||
          hasMealSelections(current) ||
          hasMealSelections(prev[date]);
        if (!needsClear) return prev;
        return {
          ...prev,
          [date]: emptySelection(),
        };
      }

      if (current.yes.length || current.maybe.length) {
        return prev;
      }

      const defaultSelection =
        value === 'yes'
          ? { yes: [allowed[0]], maybe: [] }
          : { yes: [], maybe: [allowed[0]] };

      return {
        ...prev,
        [date]: defaultSelection,
      };
    });
  };

  const cycleMealPreference = (date, meal, allowedMeals = []) => {
    const allowed = allowedMeals.length ? allowedMeals : enabledMealsForDate(poll, date);
    if (!allowed.includes(meal)) return;
    if (votes[date] === 'no') return;

    setMealPreferences(prev => {
      const current = normaliseMealSelection(prev[date], allowed);
      const yesSet = new Set(current.yes);
      const maybeSet = new Set(current.maybe);
      const currentState = yesSet.has(meal) ? 'yes' : maybeSet.has(meal) ? 'maybe' : 'none';
      const totalSelected = current.yes.length + current.maybe.length;

      let nextState;
      if (currentState === 'yes') nextState = 'maybe';
      else if (currentState === 'maybe') nextState = 'none';
      else nextState = 'yes';

      if (votes[date] === 'yes' && currentState === 'yes' && current.yes.length === 1 && nextState !== 'yes') {
        alert('Keep at least one meal marked with ✅ when you can attend.');
        return prev;
      }

      if (votes[date] !== 'no' && currentState !== 'none' && nextState === 'none' && totalSelected <= 1) {
        alert('Please keep at least one meal marked when you can attend.');
        return prev;
      }

      if (nextState === 'yes') {
        yesSet.add(meal);
        maybeSet.delete(meal);
      } else if (nextState === 'maybe') {
        yesSet.delete(meal);
        maybeSet.add(meal);
      } else {
        yesSet.delete(meal);
        maybeSet.delete(meal);
      }

      const nextSelection = {
        yes: allowed.filter(m => yesSet.has(m)),
        maybe: allowed.filter(m => maybeSet.has(m) && !yesSet.has(m)),
      };

      if (
        prev[date] &&
        !Array.isArray(prev[date]) &&
        selectionsEqual(prev[date], nextSelection)
      ) {
        return prev;
      }

      return {
        ...prev,
        [date]: nextSelection,
      };
    });
  };

  const handleHolidayEarliestChange = value => {
    setHolidayEarliest(value);
    if (holidayLatest && new Date(value) > new Date(holidayLatest)) {
      setHolidayLatest(value);
    }
  };

  const handleHolidayLatestChange = value => {
    setHolidayLatest(value);
    if (holidayEarliest && new Date(value) < new Date(holidayEarliest)) {
      setHolidayEarliest(value);
    }
  };

  const setAllVotesForValue = value => {
    if (!poll?.dates?.length) return;
    const updated = {};
    poll.dates.forEach(date => {
      updated[date] = value;
    });
    setVotes(updated);
  };

  const toTitleCase = str =>
    str
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      alert('Please enter your name.');
      return;
    }

    const normalizedName = trimmedName.toLowerCase();
    const titleCaseName = toTitleCase(trimmedName);
    const nameExists = existingVotes.some(v => v.name?.trim().toLowerCase() === normalizedName);

    if (nameExists && !email.trim()) {
      alert('Please provide your email to confirm vote update.');
      return;
    }

    if (!email.trim()) {
      alert('Please enter your email. This helps us send you updates and lets you change your vote later!');
      setIsSubmitting(false);
      return;
    }

    const missingVotes = poll.dates.filter(date => !votes[date]);
    if (missingVotes.length > 0) {
      alert('Please select your availability for all dates.');
      return;
    }

    let normalizedMealPrefs = mealPreferences;
    if (eventType === 'meal') {
      const nextPrefs = {};
      for (const date of poll.dates) {
        const allowed = enabledMealsForDate(poll, date);
        const voteValue = votes[date];

        if (!allowed.length || voteValue === 'no') {
          nextPrefs[date] = emptySelection();
          continue;
        }

        const selection = normaliseMealSelection(mealPreferences[date], allowed);
        if (voteValue === 'yes' && selection.yes.length === 0) {
          const niceDate = format(parseISO(date), 'EEE d MMM yyyy');
          alert(`Please mark at least one meal with ✅ for ${niceDate}.`);
          return;
        }
        if (selection.yes.length + selection.maybe.length === 0) {
          const niceDate = format(parseISO(date), 'EEE d MMM yyyy');
          alert(`Please pick at least one meal for ${niceDate}.`);
          return;
        }

        nextPrefs[date] = cloneSelection(selection);
      }
      normalizedMealPrefs = nextPrefs;
    }

    let parsedHolidayDuration = null;
    if (eventType === 'holiday') {
      if (!holidayEarliest || !holidayLatest) {
        alert('Please choose your earliest start and latest end dates.');
        return;
      }
      if (new Date(holidayEarliest) > new Date(holidayLatest)) {
        alert('Your latest end date needs to be on or after your earliest start date.');
        return;
      }
      parsedHolidayDuration = Number(holidayDuration);
      if (!parsedHolidayDuration || parsedHolidayDuration <= 0) {
        alert('Please let the organiser know how many days you can travel.');
        return;
      }
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    const voteData = {
      displayName: titleCaseName,
      name: normalizedName,
      email,
      votes,
      message,
      createdAt: serverTimestamp(),
      eventType,
      mealPreferences: eventType === 'meal' ? normalizedMealPrefs : null,
      holidayPreferences:
        eventType === 'holiday'
          ? {
              earliestStart: holidayEarliest,
              latestEnd: holidayLatest,
              maxDuration: parsedHolidayDuration,
            }
          : null,
    };

    try {
      const existingVote = existingVotes.find(v =>
        email
          ? v.email?.trim().toLowerCase() === email.trim().toLowerCase()
          : v.name?.trim().toLowerCase() === normalizedName
      );

      const docId = email.trim().toLowerCase();
      const voteRef = doc(db, 'polls', pollId, 'votes', docId);

      if (existingVote) {
        await updateDoc(voteRef, {
          ...voteData,
          history: arrayUnion({
            updatedAt: new Date().toISOString(),
            previousVotes: existingVote.votes || null,
            previousMessage: existingVote.message || null,
            previousMealPreferences: existingVote.mealPreferences || null,
            previousHolidayPreferences: existingVote.holidayPreferences || null,
          }),
        });
      } else {
        await setDoc(voteRef, voteData);
      }

      const bestCount = Object.values(votes).filter(v => v === 'yes').length;
      const maybeCount = Object.values(votes).filter(v => v === 'maybe').length;

      logEventIfAvailable('vote_submitted', {
        pollId,
        name: titleCaseName,
        bestCount,
        maybeCount,
        attendeeMessage: message || '',
        eventType,
        mealPreferences: eventType === 'meal' ? normalizedMealPrefs : undefined,
        holidayPreferences:
          eventType === 'holiday'
            ? {
                earliestStart: holidayEarliest,
                latestEnd: holidayLatest,
                maxDuration: parsedHolidayDuration,
              }
            : undefined,
      });

      await fetch('/api/notifyOrganiserOnVote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organiserEmail: poll.organiserEmail,
          organiserName: organiser,
          eventTitle,
          pollId,
          voterName: titleCaseName,
          votes,
          message,
          eventType,
          mealPreferences: eventType === 'meal' ? normalizedMealPrefs : undefined,
          holidayPreferences:
            eventType === 'holiday'
              ? {
                  earliestStart: holidayEarliest,
                  latestEnd: holidayLatest,
                  maxDuration: parsedHolidayDuration,
                }
              : undefined,
        }),
      });

      await fetch('/api/addAttendeeToBrevo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firstName: titleCaseName, lastName: '' }),
      });

      await fetch('/api/sendAttendeeEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firstName: titleCaseName, eventTitle, pollId }),
      });

      setStatus('✅ Your vote has been submitted successfully!');
      setName('');
      setEmail('');
      setMessage('');
      setVotes({});
      setMealPreferences({});
      setHolidayEarliest('');
      setHolidayLatest('');
      setHolidayDuration('');
      hasPrefilledExistingVote.current = false;
      router.replace(`/results/${pollId}`);
    } catch (err) {
      console.error('❌ Failed to submit vote:', err);
      setStatus('❌ Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const showBulkActions = poll?.dates?.length > 5;

  return (
    <>
      {showBulkActions && (
        <div className="sticky top-0 z-20 bg-white pt-2 pb-2 mb-4 border-b border-gray-200">
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm md:text-base text-center font-semibold">
            <button
              type="button"
              onClick={() => setAllVotesForValue('yes')}
              disabled={isSubmitting}
              className={`flex items-center gap-1 border border-green-500 bg-green-50 px-3 py-1.5 rounded-md whitespace-nowrap ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-100'
              }`}
            >
              ✅ Select All Yes
            </button>
            <button
              type="button"
              onClick={() => setAllVotesForValue('maybe')}
              disabled={isSubmitting}
              className={`flex items-center gap-1 border border-yellow-500 bg-yellow-50 px-3 py-1.5 rounded-md whitespace-nowrap ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-yellow-100'
              }`}
            >
              🤔 Select All Maybe
            </button>
            <button
              type="button"
              onClick={() => setAllVotesForValue('no')}
              disabled={isSubmitting}
              className={`flex items-center gap-1 border border-red-500 bg-red-50 px-3 py-1.5 rounded-md whitespace-nowrap ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-100'
              }`}
            >
              ❌ Select All No
            </button>
          </div>
        </div>
      )}

      {poll.dates.map(date => {
        const enabledMeals = eventType === 'meal' ? enabledMealsForDate(poll, date) : [];
        const currentMealsRaw = mealPreferences[date];
        const currentSelection = normaliseMealSelection(currentMealsRaw, enabledMeals);
        const totalMealSelections = currentSelection.yes.length + currentSelection.maybe.length;
        const voteValue = votes[date];
        const isAttending = voteValue !== 'no';
        const isYesVote = voteValue === 'yes';
        const isMaybeVote = voteValue === 'maybe';
        const mealLabel = isMaybeVote
          ? 'Which meal slots would work for you if you can make it?'
          : isBLD
          ? 'Which meal slots work for you?'
          : 'Lunch and/or dinner that work for you?';

        return (
          <div key={date} className="border p-4 mb-4 rounded">
            <div className="font-semibold mb-2">
              {format(parseISO(date), 'EEEE do MMMM yyyy')}
            </div>

            <div className="flex justify-between items-center text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={date}
                  value="yes"
                  checked={votes[date] === 'yes'}
                  onChange={() => handleVoteChange(date, 'yes')}
                /> ✅ Can attend
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={date}
                  value="maybe"
                  checked={votes[date] === 'maybe'}
                  onChange={() => handleVoteChange(date, 'maybe')}
                /> 🤔 Maybe
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={date}
                  value="no"
                  checked={votes[date] === 'no'}
                  onChange={() => handleVoteChange(date, 'no')}
                /> ❌ No
              </label>
            </div>

            {eventType === 'meal' && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {mealLabel}
                </label>
                <div className="flex flex-wrap gap-3">
                  {enabledMeals.map(meal => {
                    const isYes = currentSelection.yes.includes(meal);
                    const isMaybe = currentSelection.maybe.includes(meal);
                    const mealState = isYes ? 'yes' : isMaybe ? 'maybe' : 'none';
                    const icon = isYes ? '✅' : isMaybe ? '🤔' : '⬜️';
                    const buttonClasses = [
                      'inline-flex items-center gap-2 text-sm px-3 py-2 rounded border transition',
                      votes[date] === 'no' || isSubmitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                      mealState === 'yes'
                        ? 'bg-green-100 border-green-300 text-green-800'
                        : mealState === 'maybe'
                        ? 'bg-amber-100 border-amber-300 text-amber-900'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800',
                    ].join(' ');
                    return (
                      <button
                        key={`${date}-${meal}`}
                        type="button"
                        className={buttonClasses}
                        aria-pressed={mealState !== 'none'}
                        onClick={() => cycleMealPreference(date, meal, enabledMeals)}
                        disabled={votes[date] === 'no' || isSubmitting}
                        title="Tap to cycle between ✅ definite, 🤔 maybe, and ⬜️ unavailable"
                      >
                        <span>{icon}</span>
                        <span>{MEAL_LABELS[meal] || meal}</span>
                      </button>
                    );
                  })}
                  {enabledMeals.length === 0 && (
                    <span className="text-xs text-gray-500">No meal slots configured for this date.</span>
                  )}
                </div>
                {isAttending && enabledMeals.length > 0 && totalMealSelections === 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    Please mark at least one meal for this date.
                  </p>
                )}
                {isYesVote && enabledMeals.length > 0 && currentSelection.yes.length === 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    Mark at least one meal with ✅ if you can definitely make it.
                  </p>
                )}
                {enabledMeals.length > 0 && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Tap to cycle between ✅ definite, 🤔 maybe, and ⬜️ unavailable{isBLD ? '' : ' — lunch and dinner both count.'}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
      {eventType === 'holiday' && (
        <div className="border border-blue-200 bg-blue-50 rounded p-4 mb-4 text-sm">
          <p className="text-blue-800 font-semibold mb-3">Tell {organiser} your ideal travel window:</p>
          <label className="block font-medium text-blue-900 mb-1">Earliest you could start</label>
          <select
            className="w-full border rounded px-3 py-2 mb-3"
            value={holidayEarliest}
            onChange={(e) => handleHolidayEarliestChange(e.target.value)}
          >
            <option value="">Select a start date</option>
            {poll.dates.map(d => (
              <option key={`start-${d}`} value={d}>
                {format(parseISO(d), 'EEE d MMM yyyy')}
              </option>
            ))}
          </select>

          <label className="block font-medium text-blue-900 mb-1">Latest you could finish</label>
          <select
            className="w-full border rounded px-3 py-2 mb-3"
            value={holidayLatest}
            onChange={(e) => handleHolidayLatestChange(e.target.value)}
          >
            <option value="">Select an end date</option>
            {poll.dates.map(d => (
              <option key={`end-${d}`} value={d}>
                {format(parseISO(d), 'EEE d MMM yyyy')}
              </option>
            ))}
          </select>

          <label className="block font-medium text-blue-900 mb-1">How many days can you go for?</label>
          <input
            type="number"
            min={1}
            className="w-full border rounded px-3 py-2"
            value={holidayDuration}
            onChange={(e) => setHolidayDuration(e.target.value)}
            placeholder="e.g. 5"
          />
          <p className="mt-2 text-xs text-blue-700">
            We'll use this alongside your dates to suggest the best start and end for the group.
          </p>
        </div>
      )}

      <input
        type="text"
        placeholder="Your Nickname or First Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full mb-1 p-2 border rounded"
        required
      />
      {nameWarning && (
        <p className="text-sm text-red-600 mb-2" dangerouslySetInnerHTML={{ __html: nameWarning }} />
      )}

      <input
        type="email"
        required
        placeholder="Your email (required)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full mb-1 p-2 border rounded"
      />
      <p className="text-xs text-gray-500 mb-3">
        Add your email to get a vote confirmation, reminders, and easy updates. We’ll never spam you or share your address.
      </p>

      <textarea
        className="w-full border rounded p-2 mb-3 text-sm"
        rows={3}
        placeholder={`Optional message to ${organiser}`}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className={`bg-black text-white px-4 py-2 rounded w-full font-semibold ${
          isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {isSubmitting ? 'Submitting...' : 'Submit Vote'}
      </button>

      {status && <p className="mt-4 text-center text-green-600">{status}</p>}
    </>
  );
}
