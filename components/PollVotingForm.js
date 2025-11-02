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
  breakfast: 'Breakfast works',
  lunch: 'Lunch works',
  dinner: 'Dinner works',
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

      poll.dates.forEach(date => {
        const enabled = enabledMealsForDate(poll, date);
        const existingRaw = next[date];
        const existing = Array.isArray(existingRaw)
          ? existingRaw.filter(meal => enabled.includes(meal))
          : existingRaw
          ? [existingRaw].filter(meal => enabled.includes(meal))
          : [];

        if (!enabled.length) {
          if (existing.length) {
            next[date] = [];
            changed = true;
          }
          return;
        }

        if (votes[date] === 'no') {
          if (existing.length) {
            next[date] = [];
            changed = true;
          }
          return;
        }

        if (!existing.length) {
          next[date] = [enabled[0]];
          changed = true;
          return;
        }

        const ordered = enabled.filter(meal => existing.includes(meal));
        const differs =
          !Array.isArray(existingRaw) ||
          ordered.length !== existing.length ||
          ordered.some((meal, idx) => meal !== existing[idx]);

        if (differs) {
          next[date] = ordered;
          changed = true;
        } else {
          next[date] = existing;
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
        const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
        normalised[date] = allowed.filter(meal => arr.includes(meal));
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
  };

  const toggleMealPreference = (date, meal, allowedMeals = []) => {
    const allowed = allowedMeals.length ? allowedMeals : enabledMealsForDate(poll, date);
    if (!allowed.includes(meal)) return;
    const requireSelection = votes[date] !== 'no';

    setMealPreferences(prev => {
      const currentRaw = prev[date];
      const current = Array.isArray(currentRaw)
        ? currentRaw.filter(m => allowed.includes(m))
        : currentRaw
        ? [currentRaw].filter(m => allowed.includes(m))
        : [];
      const exists = current.includes(meal);

      if (exists && requireSelection && current.length === 1) {
        alert('Keep at least one meal selected for this date when you can attend.');
        return prev;
      }

      const nextUnordered = exists ? current.filter(m => m !== meal) : [...current, meal];
      const next = allowed.filter(m => nextUnordered.includes(m));

      return { ...prev, [date]: next };
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
        if (!allowed.length || votes[date] === 'no') {
          nextPrefs[date] = [];
          continue;
        }

        const raw = mealPreferences[date];
        const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
        const filtered = allowed.filter(meal => arr.includes(meal));

        if (!filtered.length) {
          const niceDate = format(parseISO(date), 'EEE d MMM yyyy');
          alert(`Please tick at least one meal slot for ${niceDate}.`);
          return;
        }

        nextPrefs[date] = filtered;
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
        const currentMeals = Array.isArray(currentMealsRaw)
          ? currentMealsRaw
          : currentMealsRaw
          ? [currentMealsRaw]
          : [];
        const isAttending = votes[date] !== 'no';

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
                /> Can attend
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={date}
                  value="maybe"
                  checked={votes[date] === 'maybe'}
                  onChange={() => handleVoteChange(date, 'maybe')}
                /> Maybe
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={date}
                  value="no"
                  checked={votes[date] === 'no'}
                  onChange={() => handleVoteChange(date, 'no')}
                /> No
              </label>
            </div>

            {eventType === 'meal' && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isBLD ? 'Which meal slots work for you?' : 'Lunch and/or dinner that work for you?'}
                </label>
                <div className="flex flex-wrap gap-3">
                  {enabledMeals.map(meal => {
                    const checked = currentMeals.includes(meal);
                    return (
                      <label key={`${date}-${meal}`} className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMealPreference(date, meal, enabledMeals)}
                        />
                        <span>{MEAL_LABELS[meal] || meal}</span>
                      </label>
                    );
                  })}
                  {enabledMeals.length === 0 && (
                    <span className="text-xs text-gray-500">No meal slots configured for this date.</span>
                  )}
                </div>
                {isAttending && enabledMeals.length > 0 && currentMeals.length === 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    Please tick at least one meal slot for this date.
                  </p>
                )}
                {enabledMeals.length > 0 && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Tick every meal you can make{isBLD ? '' : ' — lunch and dinner both count.'}
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
