// pages/results/[id].js
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import confetti from 'canvas-confetti';
import Head from 'next/head';

import ShareButtons from '@/components/ShareButtons';

function getSmartScoredDates(voteSummary) {
  return voteSummary.map(date => {
    const yesCount = date.yes.length;
    const maybeCount = date.maybe.length;
    const noCount = date.no.length;

    const totalVoters = yesCount + maybeCount + noCount;

    let score;
    if (totalVoters < 6) {
      score = (yesCount * 2) + (maybeCount * 1);
    } else {
      score = (yesCount * 2) + (maybeCount * 1) - (noCount * 1);
    }

    return {
      ...date,
      score,
      totalVoters,
    };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.no.length !== b.no.length) return a.no.length - b.no.length;
    return new Date(a.date) - new Date(b.date);
  });
}

export default function ResultsPage() {
  const router = useRouter();
  const { id } = router.query;

  const [poll, setPoll] = useState(null);
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [votingClosed, setVotingClosed] = useState(false);
  const hasFiredConfetti = useRef(false);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!router.isReady || !id) return;

    const fetchData = async () => {
      try {
        const pollRef = doc(db, 'polls', id);
        const pollSnap = await getDoc(pollRef);
        if (!pollSnap.exists()) {
          setLoading(false);
          return;
        }

        setPoll(pollSnap.data());

        const votesSnap = await getDocs(collection(db, 'polls', id, 'votes'));
        setVotes(votesSnap.docs.map((doc) => doc.data()));
      } catch (error) {
        console.error('Error fetching poll data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router.isReady, id]);

  useEffect(() => {
    if (!poll?.deadline?.toDate) return;
    const deadline = poll.deadline.toDate();

    const updateCountdown = () => {
      const now = new Date();
      const diff = deadline - now;

      if (diff <= 0) {
        setVotingClosed(true);
        setRevealed(true);
        setTimeLeft('Voting has closed');
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        if (days > 0) {
          setTimeLeft(`${days}d ${hours}h left to vote`);
        } else {
          setTimeLeft(`${hours}h left to vote`);
        }
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [poll]);

  const handleReveal = () => {
    setRevealed(true);
    if (!hasFiredConfetti.current) {
      hasFiredConfetti.current = true;
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
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

  const sortedByScore = getSmartScoredDates(voteSummary);
  const suggested = sortedByScore[0];

  const voteSummaryChrono = [...voteSummary].sort((a, b) => new Date(a.date) - new Date(b.date));

  const organiser = poll.organiserFirstName || 'Someone';
  const eventTitle = poll.eventTitle || 'an event';
  const location = poll.location || 'somewhere';
  const pollUrl = typeof window !== 'undefined' ? `${window.location.origin}/poll/${id}` : '';
  const attendeeMessages = votes.filter((v) => v.message?.trim());

  const shareMsg = votingClosed
    ? `🎉 Voting for ${eventTitle} in ${location} is closed and the final date is decided! Check it out 👉 ${pollUrl}`
    : `Help finalize the date for ${eventTitle} in ${location}! See the live results and vote 👉 ${pollUrl}`;

  return (
    <>
      <Head>
        <title>{organiser}'s {eventTitle} in {location}</title>
        <meta property="og:title" content={`Results for ${eventTitle}`} />
        <meta property="og:description" content={`See final date for ${eventTitle} on Set The Date`} />
        <meta property="og:image" content="https://setthedate.app/logo.png" />
        <meta property="og:url" content={pollUrl} />
      </Head>

      <div className="max-w-md mx-auto p-4">
        <img src="/images/setthedate-logo.png" alt="Set The Date Logo" className="h-32 mx-auto mb-6" />

        <h1 className="text-2xl font-bold text-center mb-2">Suggested {eventTitle} Date</h1>
        <p className="text-center text-gray-600 mb-1">📍 {location}</p>
        <p className="text-center text-blue-600 font-medium">⏳ {timeLeft}</p>

        {!revealed && !votingClosed && (
          <div
            onClick={handleReveal}
            className="mt-4 p-3 bg-green-100 text-green-800 border border-green-300 text-center rounded font-semibold cursor-pointer hover:bg-green-200"
          >
            🎉 Tap to reveal the current winning date!
          </div>
        )}

        {revealed && suggested && (
          <div className="mt-4 p-4 bg-green-100 border border-green-300 text-green-800 text-center rounded font-semibold text-lg animate-pulse">
            🎉 Your event date is set for {format(parseISO(suggested.date), 'EEEE do MMMM yyyy')}!
          </div>
        )}

        {voteSummaryChrono.map((day) => (
          <div key={day.date} className="border p-4 mt-4 rounded shadow-sm">
            <h3 className="font-semibold mb-2">{format(parseISO(day.date), 'EEEE do MMMM yyyy')}</h3>
            <div className="grid grid-cols-3 text-center text-sm">
              <div>✅ Can Attend<br />{day.yes.length}<br /><span className="text-xs">{day.yes.join(', ') || '-'}</span></div>
              <div>🤔 Maybe<br />{day.maybe.length}<br /><span className="text-xs">{day.maybe.join(', ') || '-'}</span></div>
              <div>❌ No<br />{day.no.length}<br /><span className="text-xs">{day.no.join(', ') || '-'}</span></div>
            </div>
          </div>
        ))}

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

        <div className="mt-10 space-y-6">
          <div className="flex justify-center">
            <a href={`/suggest/${id}`} className="inline-flex items-center gap-2 px-4 py-2 border border-blue-500 text-blue-600 rounded font-medium hover:bg-blue-50">
              <img src="https://cdn-icons-png.flaticon.com/512/1827/1827344.png" alt="Suggest Icon" className="w-5 h-5" />
              Suggest a change to the organiser
            </a>
          </div>

          <div className="text-center">
            <a href={`/poll/${id}`} className="text-blue-600 underline text-sm">← Back to voting page</a>
          </div>

          <div className="text-center">
            <h2 className="text-lg font-semibold mb-3">
              {votingClosed ? 'Share the Final Date with Friends' : 'Invite More People to Vote'}
            </h2>
            <ShareButtons url={pollUrl} message={shareMsg} />
          </div>

          <div className="text-center">
            <a href="/" className="inline-flex items-center text-blue-600 font-semibold hover:underline">
              <img src="https://cdn-icons-png.flaticon.com/512/747/747310.png" alt="Calendar icon" className="w-5 h-5 mr-2" />
              Create Your Own Event
            </a>
          </div>

          <div className="text-center">
            <a href="https://buymeacoffee.com/eveningout" target="_blank" rel="noopener noreferrer">
              <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" className="h-12 mx-auto" />
            </a>
          </div>
        </div>
      </div>
    </>
  );
}