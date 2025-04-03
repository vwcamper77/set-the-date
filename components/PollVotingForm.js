// components/PollVotingForm.js

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

  const handleVoteChange = (date, value) => {
    setVotes((prev) => ({ ...prev, [date]: value }));
  };

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

    // 🚀 Redirect instantly
    router.replace(`/results/${pollId}`);

    try {
      // 🧠 Save to Firestore
      await addDoc(collection(db, 'polls', pollId, 'votes'), voteData);

      // 📩 Notify organiser
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

      // 🎉 Confetti animation
      if (typeof window !== 'undefined') {
        import('canvas-confetti').then((mod) => {
          const confetti = mod.default;
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
          });
        });
      }
    } catch (err) {
      console.error('❌ Firestore write failed:', err);
      // Optional: toast or retry logic
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

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className={`bg-black text-white px-4 py-2 rounded w-full font-semibold ${
          isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {isSubmitting ? 'Submitting...' : 'Submit Vote'}
      </button>
    </>
  );
}