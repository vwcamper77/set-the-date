// Updated PollVotingForm with name-based deduplication, display name formatting, and Brevo attendee list integration
import { useState, useEffect } from 'react';
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

  useEffect(() => {
    const fetchExistingVotes = async () => {
      const voteSnap = await getDocs(collection(db, 'polls', pollId, 'votes'));
      const allVotes = voteSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExistingVotes(allVotes);
    };
    fetchExistingVotes();
  }, [pollId]);

  useEffect(() => {
    const normalizedName = name.trim().toLowerCase();
    const nameExists = existingVotes.some(v => v.name?.trim().toLowerCase() === normalizedName);
    if (!email && nameExists) {
      setNameWarning(`⚠️ Someone has already voted as "${name}". If that’s not you, add an initial.<br /><span class='text-green-600 font-semibold'>If it is you, please go ahead and make a change — your previous vote will be updated.</span>`);
    } else {
      setNameWarning('');
    }
  }, [name, email, existingVotes]);

  useEffect(() => {
    const normalizedName = name.trim().toLowerCase();
    const existingVote = existingVotes.find(v => v.email?.toLowerCase() === email.trim().toLowerCase() || (!email && v.name?.trim().toLowerCase() === normalizedName));
    if (existingVote && !email) {
      setMessage('');
      setVotes({});
    }
  }, [email, name, existingVotes]);

  const handleVoteChange = (date, value) => {
    setVotes((prev) => ({ ...prev, [date]: value }));
  };

  const toTitleCase = (str) => {
    return str.toLowerCase().split(' ').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

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

    const missingVotes = poll.dates.filter((date) => !votes[date]);
    if (missingVotes.length > 0) {
      alert('Please select your availability for all dates.');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    const voteData = {
      displayName: titleCaseName,
      name: normalizedName,
      email: email || null,
      votes,
      message,
      createdAt: serverTimestamp(),
    };

    try {
      const existingVote = existingVotes.find(v =>
        email
          ? v.email?.trim().toLowerCase() === email.trim().toLowerCase()
          : v.name?.trim().toLowerCase() === normalizedName
      );

      const docId = email ? email.trim().toLowerCase() : `name-${normalizedName}`;
      const voteRef = doc(db, 'polls', pollId, 'votes', docId);

      if (existingVote) {
        await updateDoc(voteRef, {
          ...voteData,
          history: arrayUnion({
            updatedAt: new Date().toISOString(),
            previousVotes: existingVote.votes,
            previousMessage: existingVote.message || null,
          })
        });
      } else {
        await setDoc(voteRef, voteData);
      }

      // Notify organiser
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
        }),
      });

      // Add attendee to Brevo list using internal API
      if (email) {
        await fetch('/api/addAttendeeToBrevo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: titleCaseName }),
        });
      }

      setStatus("✅ Your vote has been submitted successfully!");
      setName('');
      setEmail('');
      setMessage('');
      router.replace(`/results/${pollId}`);
    } catch (err) {
      console.error('❌ Failed to submit vote:', err);
      setStatus("❌ Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {poll.dates.map((date) => (
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
              />{' '}
              ✅ Can Attend
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={date}
                value="maybe"
                checked={votes[date] === 'maybe'}
                onChange={() => handleVoteChange(date, 'maybe')}
              />{' '}
              🤔 Maybe
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={date}
                value="no"
                checked={votes[date] === 'no'}
                onChange={() => handleVoteChange(date, 'no')}
              />{' '}
              ❌ No
            </label>
          </div>
        </div>
      ))}

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
        placeholder="Your email (required to update)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full mb-3 p-2 border rounded"
      />
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
