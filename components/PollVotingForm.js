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

const ALL_MEALS = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABELS = {
  breakfast: 'Breakfast works',
  lunch: 'Lunch works',
  dinner: 'Dinner works',
};

function mealsForDate(poll, dateISO) {
  const dayKey = (dateISO || '').slice(0, 10); // normalize to YYYY-MM-DD
  const perDate = poll?.eventOptions?.mealTimesPerDate?.[dayKey];
  if (Array.isArray(perDate) && perDate.length) {
    return ALL_MEALS.filter(m => perDate.includes(m));
  }
  const global =
    Array.isArray(poll?.eventOptions?.mealTimes) && poll.eventOptions.mealTimes.length
      ? poll.eventOptions.mealTimes
      : ALL_MEALS;
  return ALL_MEALS.filter(m => global.includes(m));
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

  // Initialize meal preferences per date:
  // - If only one slot enabled: auto-set to that slot.
  // - If 2+ slots enabled: force explicit choice via '' placeholder.
  useEffect(() => {
    if (eventType !== 'meal' || !poll?.dates?.length) return;
    setMealPreferences(prev => {
      let changed = false;
      const next = { ...prev };
      poll.dates.forEach(date => {
        const enabled = mealsForDate(poll, date);
        if (!next[date]) {
          next[date] = enabled.length === 1 ? enabled[0] : '';
          changed = true;
        } else {
          // if existing value is not allowed for this date anymore, reset
          if (next[date] && !enabled.includes(next[date])) {
            next[date] = enabled.length === 1 ? enabled[0] : '';
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [eventType, poll?.dates, poll?.eventOptions?.mealTimes, poll?.eventOptions?.mealTimesPerDate]);

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
      setMealPreferences(matched.mealPreferences);
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

  const handleMealPreferenceChange = (date, value) => {
    setMealPreferences(prev => ({ ...prev, [date]: value }));
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

    if (eventType === 'meal') {
      for (const date of poll.dates) {
        const enabled = mealsForDate(poll, date);
        const pref = mealPreferences[date];
        // Force explicit choice when multiple options are enabled
        if (enabled.length > 1 && (!pref || !enabled.includes(pref))) {
          const niceDate = format(parseISO(date), 'EEE d MMM yyyy');
          alert(`Please choose breakfast, lunch or dinner for ${niceDate}.`);
          return;
        }
        // Single option dates: auto-assign if missing
        if (enabled.length === 1 && (!pref || !enabled.includes(pref))) {
          setMealPreferences(prev => ({ ...prev, [date]: enabled[0] }));
        }
      }
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
      mealPreferences: eventType === 'meal' ? mealPreferences : null,
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
        mealPreferences: eventType === 'meal' ? mealPreferences : undefined,
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
          mealPreferences: eventType === 'meal' ? mealPreferences : undefined,
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
        const enabled = eventType === 'meal' ? mealsForDate(poll, date) : [];
        const multiple = enabled.length > 1;
        const value = mealPreferences[date] ?? (multiple ? '' : enabled[0] || '');

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
                /> ✅ Can Attend
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
                  When works best?
                </label>
                <select
                  className="border rounded px-3 py-2 text-sm w-full md:w-auto"
                  value={value}
                  onChange={(e) => handleMealPreferenceChange(date, e.target.value)}
                >
                  {enabled.length > 1 && (
                    <option value="" disabled>
                      Choose a meal…
                    </option>
                  )}
                  {enabled.map(opt => (
                    <option key={`${date}-${opt}`} value={opt}>
                      {MEAL_LABELS[opt] || opt}
                    </option>
                  ))}
                </select>
                {enabled.length > 1 && !value && (
                  <p className="text-xs text-amber-700 mt-1">Please choose breakfast, lunch or dinner for this date.</p>
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
