import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import confetti from 'canvas-confetti';
import Head from 'next/head';


export async function getServerSideProps(context) {
  const { id } = context.params;
  const docRef = doc(db, 'polls', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return { notFound: true };
  }

  const pollData = docSnap.data();

  return {
    props: {
      pollId: id,
      pollData: JSON.parse(JSON.stringify(pollData)),
    },
  };
}

export default function ResultsPage({ pollId, pollData }) {
  const [showSuggestedDate, setShowSuggestedDate] = useState(false);

  const handleReveal = () => {
    setShowSuggestedDate(true);
    confetti({
      particleCount: 150,
      spread: 100,
      origin: { y: 0.6 },
    });
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8 text-center">
      <Head>
        <title>Suggested {pollData.title} Date | Evening Out</title>
      </Head>

      <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-3 rounded mb-6">
        🎉 <strong>{pollData.firstName}</strong> invited you to <strong>{pollData.title}</strong>!
      </div>

      <div className="text-gray-700 mb-2">
        📍 <strong>{pollData.location}</strong>
      </div>

      {!showSuggestedDate && (
        <button
          onClick={handleReveal}
          className="bg-blue-600 text-white px-6 py-3 rounded-full mt-4 shadow hover:bg-blue-700 transition"
        >
          Tap to reveal the winning date!
        </button>
      )}

      {showSuggestedDate && (
        <div className="text-2xl font-semibold mt-6">
          🎉 Your evening is set for: <br />
          <span className="text-green-600">{pollData.suggestedDate || 'No date selected yet'}</span>
        </div>
      )}

      {/* Share Buttons */}
      <div className="mt-10">
        <h3 className="font-medium mb-2">Share Event with Friends</h3>
        <div className="flex justify-center gap-4 mb-4">
          <a href={`https://wa.me/?text=Hey!%20Vote%20on%20dates%20for%20${pollData.title}%20here:%20https://plan.eveningout.social/poll/${pollId}`} target="_blank" rel="noopener noreferrer">
            <img src="/icons/whatsapp.png" alt="WhatsApp" className="w-8 h-8" />
          </a>
          <a href={`https://discord.com/share?url=https://plan.eveningout.social/poll/${pollId}`} target="_blank" rel="noopener noreferrer">
            <img src="/icons/discord.png" alt="Discord" className="w-8 h-8" />
          </a>
          <a href={`https://slack.com/share?url=https://plan.eveningout.social/poll/${pollId}`} target="_blank" rel="noopener noreferrer">
            <img src="/icons/slack.png" alt="Slack" className="w-8 h-8" />
          </a>
          <a href={`https://plan.eveningout.social/poll/${pollId}`} target="_blank" rel="noopener noreferrer">
            <img src="/icons/link.png" alt="Copy Link" className="w-8 h-8" />
          </a>
        </div>
      </div>

      {/* Create your own link */}
      <div className="mt-8">
        <a href="/" className="text-blue-600 hover:underline flex justify-center items-center gap-2">
          <img src="/icons/calendar.png" alt="calendar" className="w-5 h-5" />
          Create Your Own Event
        </a>
      </div>

      {/* Buy Me a Coffee */}
      <div className="mt-10">
        <a
          href="https://buymeacoffee.com/eveningout"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="/icons/buymeacoffee-yellow.png"
            alt="Buy Me a Coffee"
            className="mx-auto w-[200px]"
          />
        </a>
      </div>
    </div>
  );
}
