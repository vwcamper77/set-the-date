import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  collection,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, parseISO } from 'date-fns';
import DateSelector from '@/components/DateSelector';
import MapboxAutocomplete from '@/components/MapboxAutocomplete';
import Head from 'next/head';

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
  const [success, setSuccess] = useState(false);

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
          return alert('Invalid or missing edit token.');
        }

        setPoll(data);
        setTitle(data.eventTitle);
        setLocation(data.location);
        setSelectedDates((data.dates || []).map(date => parseISO(date)));

        // Fetch attendee emails
        const votesSnap = await getDocs(collection(db, 'polls', id, 'votes'));
        const emails = [];
        votesSnap.forEach(doc => {
          const vote = doc.data();
          if (vote.email) emails.push(vote.email);
        });
        setAttendees(emails);
      } catch (err) {
        console.error(err);
        alert('Failed to load poll.');
      }
      setLoading(false);
    };

    loadPoll();
  }, [router.isReady, id]);

  const handleSave = async () => {
    if (!title || !location || selectedDates.length === 0) {
      return alert('Fill all fields.');
    }

    const formattedDates = selectedDates.map(date => format(date, 'yyyy-MM-dd'));

    try {
      const pollRef = doc(db, 'polls', id);
      await updateDoc(pollRef, {
        eventTitle: title,
        location,
        dates: formattedDates,
        updatedAt: Timestamp.now(),
      });

      // ✅ Notify attendees of change
      await fetch('/api/notifyAttendeesOfChange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTitle: title,
          location,
          pollId: id,
          emails: attendees,
        }),
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        router.push(`/results/${id}`);
      }, 2000);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Error saving changes.');
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this event? This cannot be undone.')) return;

    try {
      await deleteDoc(doc(db, 'polls', id));

      // ✅ Notify attendees of cancellation
      await fetch('/api/notifyAttendeesOfCancellation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTitle: poll.eventTitle,
          location: poll.location,
          pollId: id,
          emails: attendees,
        }),
      });

      alert('Event cancelled.');
      router.push('/');
    } catch (err) {
      console.error('Cancel failed:', err);
      alert('Failed to cancel event.');
    }
  };

  return (
    <>
      <Head><title>Edit Your Evening Out</title></Head>
      <div className="max-w-md mx-auto p-4">
        <img src="/images/eveningout-logo.png" alt="Logo" className="h-28 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-center mb-4">✏️ Edit Your Evening Out</h1>

        {loading ? (
          <p className="text-center">Loading...</p>
        ) : (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border p-2 mb-3 rounded"
              placeholder="Event Title"
            />
            <MapboxAutocomplete initialValue={location} setLocation={setLocation} />
            <div className="mt-4">
              <label className="block text-sm font-semibold mb-1">Update Dates</label>
              <DateSelector selectedDates={selectedDates} setSelectedDates={setSelectedDates} />
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
              ❌ Cancel Event
            </button>

            {success && (
              <p className="mt-4 text-green-600 text-center font-medium">✅ Changes saved and attendees notified.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}
