import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  deleteDoc as deleteSubDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, parseISO } from 'date-fns';
import DateSelector from '@/components/DateSelector';
import MapboxAutocomplete from '@/components/MapboxAutocomplete';
import Head from 'next/head';
import LogoHeader from '@/components/LogoHeader';
import { HOLIDAY_DURATION_OPTIONS } from '@/utils/eventOptions';

const PAID_MEAL_KEYS = [];
const pollUsesPaidMeals = (poll) => {
  const includesPaid = (list) =>
    Array.isArray(list) && list.some((meal) => PAID_MEAL_KEYS.includes(meal));
  if (includesPaid(poll?.eventOptions?.mealTimes)) return true;
  const perDate = poll?.eventOptions?.mealTimesPerDate;
  if (perDate && typeof perDate === 'object') {
    return Object.values(perDate).some((value) => includesPaid(value));
  }
  return false;
};

export default function EditPollPage() {
  const router = useRouter();
  const { id } = router.query;
  const [token, setToken] = useState(null);
  const [poll, setPoll] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);
  const [eventType, setEventType] = useState('general');
  const [mealTimes, setMealTimes] = useState(['lunch', 'dinner']);
  const [holidayDuration, setHolidayDuration] = useState(HOLIDAY_DURATION_OPTIONS[3]?.value || '5_nights');
  const [success, setSuccess] = useState(false);
  const [daysToExtend, setDaysToExtend] = useState(7);
  const [extended, setExtended] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const isProPoll =
    poll?.planType === 'pro' || poll?.unlocked || pollUsesPaidMeals(poll);

  const toggleMealTime = (time) => {
    setMealTimes((prev) => {
      if (time === 'breakfast' && !isProPoll) {
        return prev;
      }
      if (prev.includes(time)) {
        return prev.filter((entry) => entry !== time);
      }
      return [...prev, time];
    });
  };

  useEffect(() => {
    if (!router.isReady || !id) return;
    const t = router.query.token;
    setToken(t);

    const loadPoll = async () => {
      try {
        const pollRef = doc(db, 'polls', id);
        const snap = await getDoc(pollRef);

        if (!snap.exists()) {
          setLoading(false);
          return alert('Poll not found.');
        }

        const data = snap.data();
        if (data.editToken !== t) {
          setLoading(false);
          router.replace(`/share/${id}`);
          return;
        }


        setPoll(data);
        setTitle(data.eventTitle);
        setLocation(data.location);
        setSelectedDates((data.dates || []).map((date) => parseISO(date)));

        const nextEventType = data.eventType || 'general';
        setEventType(nextEventType);

        if (nextEventType === 'meal') {
          const storedMealTimes = Array.isArray(data.eventOptions?.mealTimes)
            ? data.eventOptions.mealTimes.filter(Boolean)
            : [];
          setMealTimes(storedMealTimes.length ? storedMealTimes : ['lunch', 'dinner']);
        } else {
          setMealTimes(['lunch', 'dinner']);
        }

        if (nextEventType === 'holiday') {
          const storedDuration = data.eventOptions?.proposedDuration;
          setHolidayDuration(storedDuration || (HOLIDAY_DURATION_OPTIONS[3]?.value || '5_nights'));
        } else {
          setHolidayDuration(HOLIDAY_DURATION_OPTIONS[3]?.value || '5_nights');
        }


        const votesSnap = await getDocs(collection(db, 'polls', id, 'votes'));
        const attendeeList = [];
        votesSnap.forEach(docSnap => {
          const data = docSnap.data();
          attendeeList.push({ id: docSnap.id, ...data });
        });
        setAttendees(attendeeList);
      } catch (err) {
        console.error(err);
        alert('Failed to load poll.');
      }
      setLoading(false);
    };

    loadPoll();
  }, [router.isReady, id]);
  const handleExtendDeadline = async () => {
    const newDeadline = Timestamp.fromDate(new Date(Date.now() + daysToExtend * 24 * 60 * 60 * 1000));
    try {
      await updateDoc(doc(db, 'polls', id), { deadline: newDeadline });
      alert(`Deadline updated to ${format(newDeadline.toDate(), 'EEE d MMM yyyy, h:mm a')}`);
      setExtended(true);
      window.location.reload();
    } catch (err) {
      console.error('Deadline update failed:', err);
      alert('Failed to update deadline.');
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    setSending(true);
    const res = await fetch('/api/sendAttendeeMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pollId: id,
        message,
        organiserName: poll.organiserFirstName,
        eventTitle: poll.eventTitle,
      }),
    });
    setSending(false);
    if (res.ok) {
      alert('Message sent to attendees.');
      setMessage('');
    } else {
      alert('Failed to send message.');
    }
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const trimmedLocation = location.trim();

    if (!trimmedTitle || !trimmedLocation || selectedDates.length === 0) {
      alert('Fill all fields.');
      return;
    }
    if (eventType === 'meal' && mealTimes.length === 0) {
      alert('Select at least one meal slot.');
      return;
    }

    const formattedDates = selectedDates
      .slice()
      .sort((a, b) => a - b)
      .map((date) => date.toISOString());

    let eventOptions = null;
    if (eventType === 'meal') {
      const normalizedMealTimes = Array.from(new Set(mealTimes))
        .filter(Boolean)
        .sort((a, b) => {
          const order = ['lunch', 'dinner'];
          const aIndex = order.indexOf(a);
          const bIndex = order.indexOf(b);
          return (aIndex === -1 ? order.length : aIndex) - (bIndex === -1 ? order.length : bIndex);
        });
      eventOptions = { mealTimes: normalizedMealTimes };
    } else if (eventType === 'holiday') {
      eventOptions = { proposedDuration: holidayDuration };
    }

    try {
      const pollRef = doc(db, 'polls', id);
      await updateDoc(pollRef, {
        eventTitle: trimmedTitle,
        location: trimmedLocation,
        dates: formattedDates,
        eventType,
        eventOptions,
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        router.push(`/results/${id}`);
      }, 1500);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Error saving changes.');
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this event?')) return;

    try {
      await deleteDoc(doc(db, 'polls', id));
      alert('Event cancelled.');
      router.push('/');
    } catch (err) {
      console.error('Cancel failed:', err);
      alert('Failed to cancel event.');
    }
  };

  const handleDeleteDate = (dateToRemove) => {
    setSelectedDates(selectedDates.filter(d => d.getTime() !== dateToRemove.getTime()));
  };

  const handleDeleteAttendee = async (voteId) => {
    if (!confirm('Delete this attendee and their vote?')) return;
    try {
      await deleteSubDoc(doc(db, 'polls', id, 'votes', voteId));
      setAttendees(attendees.filter(a => a.id !== voteId));
    } catch (err) {
      console.error(err);
      alert('Error deleting vote.');
    }
  };

  const handleVoteChange = async (voteId, date, newValue) => {
    const attendee = attendees.find(a => a.id === voteId);
    if (!attendee) return;

    const updatedVotes = { ...attendee.votes, [date]: newValue };

    try {
      await setDoc(doc(db, 'polls', id, 'votes', voteId), {
        ...attendee,
        votes: updatedVotes,
      });

      setAttendees(attendees.map(a => a.id === voteId ? { ...a, votes: updatedVotes } : a));
    } catch (err) {
      console.error(err);
      alert('Failed to update vote.');
    }
  };

  const deadlinePassed = poll?.deadline && new Date(poll.deadline.toDate?.() || poll.deadline) < new Date();

  return (
    <>
      <Head><title>Edit Your Event</title></Head>
      <div className="max-w-xl mx-auto p-4">
        <LogoHeader isPro={isProPoll} />

        <h1 className="text-xl font-bold text-center mb-4">
          {title ? `Edit ${title}` : 'Edit your event'}
        </h1>

        {loading ? (
          <p className="text-center">Loading...</p>
        ) : (
          <>
            <p className="text-sm text-center text-gray-600 mb-2">
              Current deadline: <strong>{format(poll.deadline.toDate(), "EEEE d MMM yyyy, h:mm a")}</strong>
            </p>

            <div className="my-6 bg-gray-100 border border-gray-300 rounded p-4 text-center">
              <label className="block font-medium mb-2">Change voting deadline</label>
              <select
                value={daysToExtend}
                onChange={(e) => setDaysToExtend(parseInt(e.target.value))}
                className="border px-3 py-2 rounded w-full max-w-xs mx-auto"
              >
                <option value={1}>1 day</option>
                <option value={2}>2 days</option>
                <option value={3}>3 days</option>
                <option value={7}>1 week</option>
                <option value={14}>2 weeks</option>
              </select>
              <button
                onClick={handleExtendDeadline}
                className="mt-3 bg-black text-white px-4 py-2 rounded font-semibold"
              >
                Update deadline
              </button>
            </div>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border p-2 mb-3 rounded"
              placeholder="Event Title"
            />
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Event type</label>
              <select
                value={eventType}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setEventType(nextType);
                  setSelectedDates([]);
                  if (nextType !== 'meal') {
                    setMealTimes(['lunch', 'dinner']);
                  }
                  if (nextType !== 'holiday') {
                    setHolidayDuration(HOLIDAY_DURATION_OPTIONS[3]?.value || '5_nights');
                  }
                }}
                className="w-full border p-2 rounded"
              >
                <option value="general">General get together</option>
                <option value="meal">Meal or drinks (lunch vs dinner)</option>
                <option value="holiday">Trip or holiday</option>
              </select>
            </div>
            {eventType === 'meal' && (
              <div className="mb-3 bg-gray-100 border border-gray-200 rounded p-3 text-sm">
                <p className="font-medium mb-2">Let guests pick the meal slot that suits them.</p>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={mealTimes.includes('breakfast')}
                      onChange={() => toggleMealTime('breakfast')}
                      disabled={!isProPoll}
                    />
                    <span>Breakfast{!isProPoll ? ' (Pro)' : ''}</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={mealTimes.includes('lunch')}
                      onChange={() => toggleMealTime('lunch')}
                    />
                    <span>Lunch</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={mealTimes.includes('dinner')}
                      onChange={() => toggleMealTime('dinner')}
                    />
                    <span>Dinner</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={mealTimes.includes('evening')}
                      onChange={() => toggleMealTime('evening')}
                    />
                    <span>Evening out</span>
                  </label>
                </div>
                <p className="mt-2 text-xs text-gray-600">
                  Attendees will rate each selected slot as yes, maybe, or no.
                </p>
                {!isProPoll && (
                  <p className="mt-2 text-xs text-gray-700">
                    Want breakfast slots?{' '}
                    <a href="/pricing" className="font-semibold text-blue-600 underline">
                      Upgrade to Pro
                    </a>
                    .
                  </p>
                )}
              </div>
            )}
            {eventType === 'holiday' && (
              <div className="mb-3 bg-blue-50 border border-blue-100 rounded p-3 text-sm text-blue-800 space-y-2">
                <p>We'll ask everyone for their earliest start, latest end, and maximum trip length to surface the best window.</p>
                <label className="block text-xs font-semibold text-blue-900">Proposed trip length</label>
                <select
                  value={holidayDuration}
                  onChange={(e) => setHolidayDuration(e.target.value)}
                  className="w-full border border-blue-200 rounded px-3 py-2 text-sm"
                >
                  {HOLIDAY_DURATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <MapboxAutocomplete initialValue={location} setLocation={setLocation} />

            <div className="mt-5 text-center">
              <label className="block text-sm font-semibold mb-2">
                {eventType === 'holiday' ? 'Update date window' : 'Update Dates'}
              </label>
              <div className="flex justify-center">
                <DateSelector
                  eventType={eventType}
                  selectedDates={selectedDates}
                  setSelectedDates={setSelectedDates}
                />
              </div>
              <ul className="mt-3 space-y-2 max-w-sm mx-auto">
                {selectedDates.map(date => (
                  <li key={date.toISOString()} className="flex justify-between items-center bg-gray-100 px-3 py-2 rounded">
                    <span>{format(date, 'EEEE do MMMM yyyy')}</span>
                    <button onClick={() => handleDeleteDate(date)} className="text-red-500 font-bold">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6">
              <h2 className="text-md font-semibold mb-2">Attendees</h2>
              {attendees.length === 0 && <p className="text-sm text-gray-600">No attendees yet.</p>}
              {attendees.map(att => (
                <div key={att.id} className="mb-4 p-3 border rounded bg-white">
                  <div className="flex justify-between items-center">
                    <strong>{att.name || 'Anonymous'}</strong>
                    <button onClick={() => handleDeleteAttendee(att.id)} className="text-red-600 text-sm">
                      Remove attendee
                    </button>
                  </div>
                  <p className="text-sm italic text-gray-600 mt-1">{att.message || 'No message'}</p>

                  {selectedDates.map(date => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const currentVote = att.votes?.[dateStr] || 'none';
                    return (
                      <div key={dateStr} className="flex items-center gap-2 mt-2">
                        <span className="w-40">{format(date, 'EEE do MMM')}</span>
                        <select
                          value={currentVote}
                          onChange={(e) => handleVoteChange(att.id, dateStr, e.target.value)}
                          className="border px-2 py-1 rounded"
                        >
                          <option value="yes">Yes</option>
                          <option value="maybe">Maybe</option>
                          <option value="no">No</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-6">
              <label className="block text-sm font-semibold mb-2">Send a message to all attendees</label>
              <textarea
                rows={3}
                className="w-full border rounded p-2 mb-2"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
              ></textarea>
              <button
                onClick={handleSendMessage}
                disabled={sending || !message.trim()}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 w-full"
              >
                Send message
              </button>
            </div>

            <button
              onClick={handleSave}
              className="mt-6 w-full bg-black text-white py-2 rounded font-semibold"
            >
              Save Changes
            </button>

            <button
              onClick={handleCancel}
              className="mt-3 w-full border border-red-600 text-red-600 py-2 rounded font-semibold"
            >
              Cancel event
            </button>

            {success && (
              <p className="mt-4 text-green-600 text-center font-medium">
                Changes saved and attendees notified.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}





