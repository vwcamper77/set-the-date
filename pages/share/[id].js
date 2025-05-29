// pages/share/[id].js
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { format, parseISO } from 'date-fns';
import Head from "next/head";
import LogoHeader from '../../components/LogoHeader';
import ShareButtonsLayout from '../../components/ShareButtonsLayout';

export default function SharePage() {
  const router = useRouter();
  const { id } = router.query;
  const [poll, setPoll] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  const baseURL = process.env.NEXT_PUBLIC_BASE_URL || "https://plan.setthedate.app";
  const capitalise = (s) => s?.charAt(0).toUpperCase() + s.slice(1);

  useEffect(() => {
    if (!id) return;
    const fetchPoll = async () => {
      const docRef = doc(db, 'polls', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) setPoll(docSnap.data());
      else console.error("Poll not found");
    };
    fetchPoll();
  }, [id]);

  useEffect(() => {
    if (!poll || !id) return;
    const notifyAdmin = async () => {
      const payload = {
        organiserName: poll.organiserFirstName || "Unknown",
        eventTitle: poll.eventTitle || poll.title || "Untitled Event",
        location: poll.location || "Unspecified",
        selectedDates: poll.dates || [],
        pollId: id,
        pollLink: `https://plan.setthedate.app/poll/${id}`
      };
      try {
        await fetch('/api/notifyAdmin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error("❌ Admin notify error:", err);
      }
    };
    notifyAdmin();
  }, [poll, id]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2500);
  };

  const share = (platform) => {
    const pollLink = `${baseURL}/poll/${id}`;
    const organiser = poll.organiserFirstName || "someone";
    const eventTitle = capitalise(poll.eventTitle || poll.title || "an event");
    const location = poll.location || "somewhere";
    const shareMessage = `Hey, you're invited to ${eventTitle} in ${location}. Vote on what day suits you now: ${pollLink} — Hope to see you there! – ${organiser}`;

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
      showToast("🔗 Link copied to clipboard!");
    } else if (platform === "discord" || platform === "slack") {
      navigator.clipboard.writeText(pollLink);
      const platformName = platform === 'discord' ? 'Discord' : 'Slack';
      showToast(`🔗 Link copied! Paste it in ${platformName}.`);
    } else {
      window.open(pollLink, "_blank");
    }
  };

  if (!poll) return <div className="text-center mt-8">Loading...</div>;

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
        <ShareButtonsLayout onShare={share} />

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

      {toastMessage && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white text-black text-base font-medium px-6 py-3 rounded-xl shadow-xl z-50 border border-gray-300 animate-fade-in-out"
             style={{ WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', fontWeight: 500 }}>
          {toastMessage}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeInOut {
          0%, 100% { opacity: 0; transform: scale(0.95); }
          10%, 90% { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in-out {
          animation: fadeInOut 2.5s ease-in-out;
        }
      `}</style>
    </>
  );
}
