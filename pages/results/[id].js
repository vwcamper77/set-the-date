// pages/results/[id].js
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import confetti from 'canvas-confetti';
import Head from 'next/head';
import ShareButtons from '@/components/ShareButtons';
import CountdownTimer from '@/components/CountdownTimer';
import FinalisePollActions from '@/components/FinalisePollActions';

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

function toTitleCase(name) {
  return name
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function ResultsPage() {
  const router = useRouter();
  const { id } = router.query;

  const [poll, setPoll] = useState(null);
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const hasFiredConfetti = useRef(false);
  const [isOrganiser, setIsOrganiser] = useState(false);

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
        const pollData = { ...pollSnap.data(), id };
        setPoll(pollData);

        const votesSnap = await getDocs(collection(db, 'polls', id, 'votes'));
        const allVotes = votesSnap.docs.map(doc => doc.data());

        const dedupedVotes = {};
        allVotes.forEach(vote => {
          const rawName = (vote.displayName || vote.name || '').trim();
          const nameKey = rawName.toLowerCase();
          if (!nameKey) return;
          const existing = dedupedVotes[nameKey];
          if (!existing || vote.createdAt?.seconds > existing.createdAt?.seconds) {
            dedupedVotes[nameKey] = {
              ...vote,
              displayName: toTitleCase(rawName)
            };
          }
        });

        setVotes(Object.values(dedupedVotes));

        if (router.query.token && pollData.editToken) {
          setIsOrganiser(router.query.token === pollData.editToken);
        }

      } catch (error) {
        console.error('Error fetching poll data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router.isReady, id]);

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
      const display = v.displayName || v.name || 'Someone';
      if (res === 'yes' && !yes.includes(display)) yes.push(display);
      else if (res === 'maybe' && !maybe.includes(display)) maybe.push(display);
      else if (res === 'no' && !no.includes(display)) no.push(display);
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

  const deadlineISO = poll?.deadline?.toDate ? poll.deadline.toDate().toISOString() : null;
  const votingClosed = deadlineISO && new Date() > new Date(deadlineISO);
  const winningDate = suggested?.date ? format(parseISO(suggested.date), 'EEEE do MMMM yyyy') : null;

  const shareMessage = votingClosed && winningDate
    ? `🎉 The date is set! "${eventTitle}" is happening on ${winningDate} in ${location}. See who’s coming 👉 ${pollUrl}`
    : `🕳️ Help choose the best date for "${eventTitle}" in ${location}. Cast your vote 👉 ${pollUrl}`;

  const emailSubject = votingClosed
    ? `Final Date Set for ${eventTitle}`
    : `Vote on Dates for ${eventTitle}`;

  const deadlinePassed = new Date(poll.deadline?.toDate?.()) < new Date();
  const hasFinalDate = Boolean(poll.finalDate);
  const suggestedDate = sortedByScore[0]?.date;

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <Head>
        <title>{organiser}'s {eventTitle} in {location}</title>
        <meta property="og:title" content={`Results for ${eventTitle}`} />
        <meta property="og:description" content={`See the final date for ${eventTitle} on Set The Date`} />
        <meta property="og:image" content="https://plan.setthedate.app/logo.png" />
        <meta property="og:url" content={pollUrl} />
      </Head>

      <img src="/images/setthedate-logo.png" alt="Set The Date Logo" className="h-32 mx-auto mb-6" />

      <h1 className="text-2xl font-bold text-center mb-2">Suggested {eventTitle} Date</h1>
      <p className="text-center text-gray-600 mb-1">📍 {location}</p>
      {deadlineISO && <p className="text-center text-blue-600 font-medium"><CountdownTimer deadline={deadlineISO} /></p>}

      {!revealed && (
        <div onClick={handleReveal} className="mt-4 p-3 bg-green-100 text-green-800 border border-green-300 text-center rounded font-semibold cursor-pointer hover:bg-green-200">
          🎉 Tap to reveal the current winning date!
        </div>
      )}

      {revealed && suggested && (
        <div className="mt-4 p-4 bg-green-100 border border-green-300 text-green-800 text-center rounded font-semibold text-lg animate-pulse">
          🎉 Your event date is set for {winningDate}!
        </div>
      )}

      {hasFinalDate ? (
        <div className="bg-green-100 border border-green-300 text-green-800 p-3 mb-4 rounded text-center font-semibold">
          ✅ {poll.eventTitle} is scheduled for {format(parseISO(poll.finalDate), 'EEEE do MMMM yyyy')} in {poll.location}.
        </div>
      ) : deadlinePassed ? (
        isOrganiser ? (
          <FinalisePollActions poll={poll} suggestedDate={suggestedDate} />
        ) : (
          <div className="text-center text-gray-600 mb-4">
            ⏳ Voting has closed. The final date will be announced soon.
          </div>
        )
      ) : null}

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
                <strong>{v.displayName || v.name || 'Someone'}:</strong><br />
                <span>{v.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 p-6 bg-yellow-50 border border-yellow-300 rounded-lg text-center">
        <h2 className="text-xl font-semibold mb-3">📢 Share the Final Plan</h2>
        <p className="text-gray-700 text-base mb-4 max-w-sm mx-auto">
          {votingClosed
            ? `Let friends know ${organiser} set the date for "${eventTitle}" in ${location}.`
            : `Spread the word – there’s still time to vote on "${eventTitle}" in ${location}!`}
        </p>
        <ShareButtons shareUrl={pollUrl} shareMessage={shareMessage} />
      </div>

      <div className="text-center mt-8 space-y-4">
        <a href={`/poll/${id}`} className="inline-block bg-white text-blue-600 font-medium border border-blue-600 rounded px-4 py-2 text-sm hover:bg-blue-50">← Back to voting page</a>

        <div>
          <a href="/" className="inline-flex items-center text-blue-600 font-semibold hover:underline">
            <img src="https://cdn-icons-png.flaticon.com/512/747/747310.png" alt="Calendar icon" className="w-5 h-5 mr-2" />
            Create Your Own Event
          </a>
        </div>

        <div>
          <a href="https://buymeacoffee.com/eveningout" target="_blank" rel="noopener noreferrer">
            <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" className="h-12 mx-auto" />
          </a>
        </div>
      </div>
    </div>
  );
}
