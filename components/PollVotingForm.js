import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
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

  // Handle the change of votes for a specific date
  const handleVoteChange = (date, value) => {
    setVotes((prev) => ({ ...prev, [date]: value }));
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!name.trim()) {
      alert('Please enter your name.');
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
      name,
      email,
      votes,
      message,
      createdAt: serverTimestamp(),
    };

    try {
      // Save to Firestore (store the vote data)
      await addDoc(collection(db, 'polls', pollId, 'votes'), voteData);

      // Notify the organiser (send an email or notification - optional)
      await fetch('/api/notifyOrganiserOnVote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organiserEmail: poll.organiserEmail,
          organiserName: organiser,
          eventTitle,
          pollId,
          voterName: name,
          votes,
          message,
        }),
      });

      setStatus("✅ Your vote has been submitted successfully!");
      setName('');
      setEmail('');
      setMessage('');
      router.replace(`/results/${pollId}`); // Redirect to results page after submission
    } catch (err) {
      console.error('❌ Failed to submit vote:', err);
      setStatus("❌ Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Render available dates for voting */}
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
                onChange={() => handleVoteChange(date, 'yes')}
              />{' '}
              ✅ Can Attend
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={date}
                value="maybe"
                onChange={() => handleVoteChange(date, 'maybe')}
              />{' '}
              🤔 Maybe
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={date}
                value="no"
                onChange={() => handleVoteChange(date, 'no')}
              />{' '}
              ❌ No
            </label>
          </div>
        </div>
      ))}

      {/* Input fields for name, email, and message */}
      <input
        type="text"
        placeholder="Your Nickname or First Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full mb-3 p-2 border rounded"
        required
      />
      <input
        type="email"
        placeholder="Your email (optional)"
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

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className={`bg-black text-white px-4 py-2 rounded w-full font-semibold ${
          isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {isSubmitting ? 'Submitting...' : 'Submit Vote'}
      </button>

      {/* Display status messages (e.g., submission success or failure) */}
      {status && <p className="mt-4 text-center text-green-600">{status}</p>}
    </>
  );
}
