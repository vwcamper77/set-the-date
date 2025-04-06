import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { format, parseISO } from 'date-fns';
import Head from "next/head";
import LogoHeader from '../../components/LogoHeader';

export default function SharePage() {
  const router = useRouter();
  const { id } = router.query;
  const [poll, setPoll] = useState(null);

  const baseURL = process.env.NEXT_PUBLIC_BASE_URL || "https://plan.setthedate.app";

  const capitalise = (s) => s?.charAt(0).toUpperCase() + s.slice(1);

  // 1. Fetch poll data
  useEffect(() => {
    const fetchPoll = async () => {
      if (!id) return;
      const docRef = doc(db, 'polls', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setPoll(docSnap.data());
      } else {
        console.error("Poll not found");
      }
    };

    fetchPoll();
  }, [id]);

  // 2. Notify admin once poll is loaded
  useEffect(() => {
    const notifyAdmin = async () => {
      if (!poll || !id) return;

      const payload = {
        organiserName: poll.organiserFirstName || "Unknown",
        eventTitle: poll.eventTitle || poll.title || "Untitled Event",
        location: poll.location || "Unspecified",
        selectedDates: poll.dates || [],
        pollId: id,
        pollLink: `https://plan.setthedate.app/poll/${id}`
      };

      try {
        const res = await fetch('/api/notifyAdmin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const error = await res.json();
          console.error("❌ Admin notify failed:", error);
        } else {
          console.log("✅ Admin notified");
        }
      } catch (err) {
        console.error("❌ Admin notify error:", err);
      }
    };

    notifyAdmin();
  }, [poll, id]);

  // 3. Handle share actions
  const share = (platform) => {
    const pollLink = `${baseURL}/poll/${id}`;
    const organiser = poll.organiserFirstName || "someone";
    const eventTitle = capitalise(poll.eventTitle || poll.title || "an event");
    const location = poll.location || "somewhere";
    const shareMessage = `Hey, you're invited to ${eventTitle} in ${location}!\nVote on what day suits you now: ${pollLink}\n\nHope to see you there! – ${organiser}`;

    if (platform === "whatsapp") {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`, "_blank");
    } else if (platform === "email") {
      const subject = encodeURIComponent(`${organiser} invites you to ${eventTitle} in ${location}`);
      const body = encodeURIComponent(shareMessage);
      window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
    } else if (platform === "sms") {
      window.open(`sms:?&body=${encodeURIComponent(shareMessage)}`, "_blank");
    } else if (platform === "copy") {
      navigator.clipboard.writeText(pollLink);
      alert("Link copied to clipboard!");
    } else {
      window.open(pollLink, "_blank");
    }
  };

  if (!poll) {
    return <div className="text-center mt-8">Loading...</div>;
  }

  const organiser = poll.organiserFirstName || "someone";
  const eventTitle = capitalise(poll.eventTitle || poll.title || "an event");

  return (
    <>
      <Head>
        <title>Share Your Set The Date Poll</title>
        <meta property="og:title" content={`${organiser} is planning ${eventTitle} in ${poll.location}`} />
        <meta property="og:description" content="Vote now to help choose a date!" />
        <meta property="og:image" content="https://plan.setthedate.app/logo.png" />
        <meta property="og:url" content={`${baseURL}/share/${id}`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div className="max-w-md mx-auto p-4">
        <LogoHeader />

        <h1 className="text-2xl font-bold text-center mb-2">Share Your Set The Date Poll</h1>

        <p className="text-green-600 text-center mb-4 text-sm font-medium">
          📬 We've emailed you your unique poll link — if you don’t see it, please check your spam or junk folder and mark it as safe!
        </p>

        <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 p-3 mb-4 rounded text-center font-semibold">
          🎉 {organiser} is planning a {eventTitle} event!
        </div>

        <div className="flex items-center justify-center gap-2 mb-6 text-sm text-gray-700 font-medium">
          <img src="https://cdn-icons-png.flaticon.com/512/684/684908.png" alt="Location Icon" className="w-4 h-4" />
          <span>{poll.location}</span>
        </div>

        <p className="text-center mb-4">Invite your friends to vote on your event dates:</p>

        {poll.dates?.length > 0 && (
          <ul className="text-center text-gray-700 text-base font-medium mb-6 space-y-1">
            {poll.dates.map((date, index) => (
              <li key={index}>{format(parseISO(date), 'EEEE do MMMM yyyy')}</li>
            ))}
          </ul>
        )}

        <h2 className="text-xl font-semibold mb-4 text-center">Share Event with Friends</h2>
        <div className="flex flex-col gap-3 items-center">
          <button onClick={() => share("whatsapp")} className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded w-64">📲 Share via WhatsApp</button>
          <button onClick={() => share("sms")} className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded w-64">📱 Share via SMS</button>
          <button onClick={() => share("discord")} className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded w-64">💬 Share via Discord</button>
          <button onClick={() => share("slack")} className="bg-pink-500 hover:bg-pink-600 text-white font-semibold py-2 px-4 rounded w-64">📨 Share via Slack</button>
          <button onClick={() => share("copy")} className="bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2 px-4 rounded w-64">🔗 Copy Poll Link</button>
          <button onClick={() => share("email")} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded w-64">📧 Share via Email</button>
        </div>

        <div className="text-center mt-8">
          <a href={`/poll/${id}`} className="inline-block bg-black text-white px-4 py-2 rounded font-semibold hover:bg-gray-800 mt-6">
            ➕ Add Your Own Date Preferences
          </a>
        </div>

        <div className="text-center mt-10">
          <a href="https://buymeacoffee.com/eveningout" target="_blank" rel="noopener noreferrer" className="inline-block">
            <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" className="h-12 mx-auto" />
          </a>
        </div>
      </div>
    </>
  );
}