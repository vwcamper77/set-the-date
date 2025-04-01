// pages/results/[id].js

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import confetti from 'canvas-confetti';
import Head from 'next/head';

export default function ResultsPage() {
  const router = useRouter();
  const { id } = router.query;

  const [poll, setPoll] = useState(null);
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const hasFiredConfetti = useRef(false);

  useEffect(() => {
    if (!router.isReady || !id) return;

    const fetchData = async () => {
      try {
        const pollRef = doc(db, 'polls', id);
        const pollSnap = await getDoc(pollRef);
        if (pollSnap.exists()) setPoll(pollSnap.data());

        const votesSnap = await getDocs(collection(db, 'polls', id, 'votes'));
        setVotes(votesSnap.docs.map((doc) => doc.data()));
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router.isReady, id]);

  useEffect(() => {
    if (!poll?.createdAt?.toDate) return;
    const createdAt = poll.createdAt.toDate();
    const deadline = new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000);

    const updateCountdown = () => {
      const now = new Date();
      const diff = deadline - now;
      if (diff <= 0) {
        setRevealed(true);
        setTimeLeft('Voting has closed');
      } else {
        const h = Math.floor(diff / 1000 / 60 / 60);
        const m = Math.floor((diff / 1000 / 60) % 60);
        const s = Math.floor((diff / 1000) % 60);
        setTimeLeft(`${h}h ${m}m ${s}s left to vote`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [poll]);

  const handleReveal = () => {
    setRevealed(true);
    if (!hasFiredConfetti.current) {
      hasFiredConfetti.current = true;
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  };

  if (loading) return <p className="p-4">Loading...</p>;
  if (!poll) return <p className="p-4">Poll not found.</p>;

  const voteSummary = poll.dates.map((date) => {
    const yes = [], maybe = [], no = [];
    votes.forEach((v) => {
      const res = v.votes[date];
      if (res === 'yes') yes.push(v.name);
      else if (res === 'maybe') maybe.push(v.name);
      else if (res === 'no') no.push(v.name);
    });
    return { date, yes, maybe, no };
  });

  const sorted = [...voteSummary].sort((a, b) => b.yes.length - a.yes.length);
  const suggested = sorted[0];
  const organiser = poll.organiserFirstName || 'Someone';
  const pollUrl = typeof window !== 'undefined' ? window.location.origin + `/poll/${id}` : '';
  const attendeeMessages = votes.filter((v) => v.message?.trim());

  const share = (platform) => {
    const msg = `Hey, you're invited to ${poll.eventTitle} in ${poll.location}! Vote here: ${pollUrl}`;
    if (platform === 'copy') {
      navigator.clipboard.writeText(pollUrl);
      alert('Link copied!');
    } else if (platform === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`);
    } else {
      window.open(pollUrl);
    }
  };

  return (
    <>
      <Head>
        <title>{organiser}'s {poll.eventTitle} in {poll.location}</title>
      </Head>

      <div className="max-w-md mx-auto p-4">
        <img src="/images/eveningout-logo.png" alt="Evening Out Logo" className="h-32 mx-auto mb-6" />

        <h1 className="text-2xl font-bold text-center mb-2">Suggested {poll.eventTitle} Date</h1>
        <p className="text-center text-gray-600 mb-1">📍 {poll.location}</p>
        <p className="text-center text-blue-600 font-medium">⏳ {timeLeft}</p>

        {!revealed && (
          <div
            onClick={handleReveal}
            className="mt-4 p-3 bg-green-100 text-green-800 border border-green-300 text-center rounded font-semibold cursor-pointer hover:bg-green-200"
          >
            🎉 Tap to reveal the current winning date!
          </div>
        )}

        <div className="mt-4 bg-yellow-100 text-yellow-900 border border-yellow-300 p-3 rounded text-center font-semibold">
          🎉 {organiser} is planning {poll.eventTitle} — see how people voted!
        </div>

        {revealed && suggested && (
          <div className="mt-4 p-4 bg-green-100 border border-green-300 text-green-800 text-center rounded font-semibold text-lg animate-pulse">
            🎉 Your evening is set for {format(parseISO(suggested.date), 'EEEE do MMMM yyyy')}!
          </div>
        )}

        {voteSummary.map((s) => (
          <div key={s.date} className="border p-4 mt-4 rounded shadow-sm">
            <h3 className="font-semibold mb-2">{format(parseISO(s.date), 'EEEE do MMMM yyyy')}</h3>
            <div className="grid grid-cols-3 text-center text-sm">
              <div>
                ✅ Can Attend<br />{s.yes.length}<br />
                <span className="text-xs">{s.yes.join(', ') || '-'}</span>
              </div>
              <div>
                🤔 Maybe<br />{s.maybe.length}<br />
                <span className="text-xs">{s.maybe.join(', ') || '-'}</span>
              </div>
              <div>
                ❌ No<br />{s.no.length}<br />
                <span className="text-xs">{s.no.join(', ') || '-'}</span>
              </div>
            </div>
          </div>
        ))}

        {/* Messages */}
        {attendeeMessages.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-3">💬 Messages from attendees</h2>
            <ul className="space-y-3">
              {attendeeMessages.map((v, i) => (
                <li key={i} className="border p-3 rounded bg-gray-50 text-sm">
                  <strong>{v.name || 'Someone'}:</strong><br />
                  <span>{v.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Bottom Area */}
        <div className="mt-10 space-y-6">

          <div className="flex justify-center">
            <a
              href={`/suggest/${id}`}
              className="inline-flex items-center gap-2 px-4 py-2 border border-blue-500 text-blue-600 rounded font-medium hover:bg-blue-50"
            >
              <img src="https://cdn-icons-png.flaticon.com/512/1827/1827344.png" className="w-5 h-5" />
              Suggest a change to the organiser
            </a>
          </div>

          <div className="text-center">
            <a href={`/poll/${id}`} className="text-blue-600 underline text-sm">
              ← Back to voting page
            </a>
          </div>

          <div className="text-center">
            <h2 className="text-lg font-semibold mb-3">Share Event with Friends</h2>
            <div className="flex justify-center gap-4">
              <button onClick={() => share('whatsapp')}>
                <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" className="w-8 h-8" />
              </button>
              <button onClick={() => share('copy')}>
                <img src="https://cdn-icons-png.flaticon.com/512/1388/1388978.png" className="w-8 h-8" />
              </button>
              <button onClick={() => share('email')}>
                <img src="https://cdn-icons-png.flaticon.com/512/732/732200.png" className="w-8 h-8" />
              </button>
            </div>
          </div>

          <div className="text-center">
            <a href="/" className="inline-flex items-center text-blue-600 font-semibold hover:underline">
              <img src="https://cdn-icons-png.flaticon.com/512/747/747310.png" className="w-5 h-5 mr-2" />
              Create Your Own Event
            </a>
          </div>

          <div className="text-center">
            <a
              href="https://buymeacoffee.com/eveningout"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                alt="Buy Me a Coffee"
                className="h-12 mx-auto"
              />
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
