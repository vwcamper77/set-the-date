import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Head from 'next/head';

export default function SuggestPage() {
  const router = useRouter();
  const { id } = router.query;

  const [poll, setPoll] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const fetchPoll = async () => {
      if (!id) return;

      try {
        const docRef = doc(db, 'polls', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPoll(data); // ✅ Correctly updates poll with editToken
        } else {
          setStatus('Poll not found.');
        }
      } catch (err) {
        console.error('Error loading poll:', err);
        setStatus('Something went wrong loading the poll.');
      }
    };

    fetchPoll();
  }, [id]);

  const handleSubmit = async () => {
    if (!name || !email || !message) {
      alert("All fields are required.");
      return;
    }

    if (!poll) {
      alert("Poll not loaded yet.");
      return;
    }

    try {
      const res = await fetch('/api/notifyOrganiserOnSuggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organiserEmail: poll.organiserEmail,
          organiserName: poll.organiserFirstName || 'Someone',
          eventTitle: poll.eventTitle || poll.title || 'your event',
          pollId: id,
          editToken: poll.editToken, // ✅ Send it to the email template
          name,
          email,
          message,
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      setStatus('✅ Suggestion sent!');
      setName('');
      setEmail('');
      setMessage('');
    } catch (err) {
      console.error('❌ Failed to submit suggestion:', err);
      alert('Something went wrong. Please try again.');
    }
  };

  return (
    <>
      <Head>
        <title>Suggest a Change | Evening Out</title>
      </Head>

      <div className="max-w-md mx-auto p-4">
        <img src="/images/eveningout-logo.png" className="h-32 mx-auto mb-4" alt="Evening Out" />
        <h1 className="text-2xl font-bold mb-4 text-center">💬 Suggest a Change</h1>

        {poll ? (
          <>
            <p className="text-center text-gray-600 mb-6">
              Suggest a new date or leave a note for <strong>{poll.organiserFirstName}</strong> of <strong>{poll.eventTitle}</strong> in <strong>{poll.location}</strong>.
            </p>

            <input
              type="text"
              placeholder="Your Name"
              className="w-full p-2 border rounded mb-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="email"
              placeholder="Your Email"
              className="w-full p-2 border rounded mb-3"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <textarea
              placeholder="Your Suggestion"
              rows={4}
              className="w-full p-2 border rounded mb-3"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            <button
              onClick={handleSubmit}
              className="w-full bg-black text-white py-2 rounded font-semibold"
            >
              Submit Suggestion
            </button>

            {status && <p className="mt-4 text-center text-green-600">{status}</p>}

            <div className="text-center mt-6">
              <a href={`/results/${id}`} className="text-blue-600 underline text-sm">← Back to results</a>
            </div>
          </>
        ) : (
          <p className="text-center text-gray-500">Loading event info...</p>
        )}
      </div>
    </>
  );
}
