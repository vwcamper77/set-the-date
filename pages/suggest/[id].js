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
          setPoll(docSnap.data());
        } else {
          setStatus('❌ Poll not found.');
        }
      } catch (err) {
        console.error('Error loading poll:', err);
        setStatus('❌ Something went wrong loading the poll.');
      }
    };

    fetchPoll();
  }, [id]);

  const handleSubmit = async () => {
    if (!name || !email || !message) {
      alert('All fields are required.');
      return;
    }

    if (!poll || !poll.editToken) {
      alert('Poll data not loaded yet.');
      return;
    }

    try {
      const res = await fetch('/api/notifyOrganiserOnSuggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organiserEmail: poll.organiserEmail,
          organiserName: poll.organiserFirstName || 'Someone',
          eventTitle: poll.eventTitle || 'your event',
          location: poll.location || '',
          pollId: id,
          editToken: poll.editToken,
          message,
          senderName: name,
          senderEmail: email,
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      setStatus('✅ Suggestion sent successfully!');
      setName('');
      setEmail('');
      setMessage('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('❌ Failed to submit suggestion:', err);
      setStatus('❌ Something went wrong. Please try again.');
    }
  };

  return (
    <>
      <Head>
        <title>Suggest a Change | Set The Date</title>
      </Head>

      <div className="max-w-md mx-auto p-4">
        <img
          src="/images/setthedate-logo.png"
          className="h-20 mx-auto mb-6"
          alt="Set The Date Logo"
        />

        <h1 className="text-2xl font-bold mb-4 text-center">💬 Suggest a Change</h1>

        {poll ? (
          <>
            <p className="text-center text-gray-600 mb-6">
              Suggest a new date or leave a note for <strong>{poll.organiserFirstName}</strong>{' '}
              about <strong>{poll.eventTitle}</strong> in{' '}
              <strong>{poll.location}</strong>.
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

            {status && (
              <p
                className={`mt-4 text-center font-medium ${
                  status.startsWith('✅')
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {status}
              </p>
            )}

            <div className="text-center mt-6">
              <a href={`/results/${id}`} className="text-blue-600 underline text-sm">
                ← Back to results
              </a>
            </div>
          </>
        ) : (
          <p className="text-center text-gray-500">Loading event info...</p>
        )}
      </div>
    </>
  );
}
