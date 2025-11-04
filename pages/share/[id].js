// pages/share/[id].js
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { format, parseISO } from 'date-fns';
import Head from "next/head";
import LogoHeader from '../../components/LogoHeader';
import ShareButtonsLayout from '../../components/ShareButtonsLayout';

import { getHolidayDurationLabel } from '@/utils/eventOptions';

const pollUsesPaidMeals = (poll) => {
  const includesEvening = (list) =>
    Array.isArray(list) && list.includes('evening');
  if (includesEvening(poll?.eventOptions?.mealTimes)) return true;
  const perDate = poll?.eventOptions?.mealTimesPerDate;
  if (perDate && typeof perDate === 'object') {
    return Object.values(perDate).some((value) => includesEvening(value));
  }
  return false;
};
export default function SharePage() {
  const router = useRouter();
  const { id } = router.query;
  const [poll, setPoll] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  const baseURL = process.env.NEXT_PUBLIC_BASE_URL || "https://plan.setthedate.app";
  const capitalise = (s) => s?.charAt(0).toUpperCase() + s.slice(1);
  const eventType = poll?.eventType || 'general';
  const isProPoll =
    poll?.planType === 'pro' || poll?.unlocked || pollUsesPaidMeals(poll);
  const isHolidayEvent = eventType === 'holiday';
  const rawDateValues = (() => {
    if (Array.isArray(poll?.dates) && poll.dates.length > 0) return poll.dates;
    if (Array.isArray(poll?.selectedDates) && poll.selectedDates.length > 0) return poll.selectedDates;
    return [];
  })();

  const normalisedDateEntries = rawDateValues
    .map((value) => {
      if (!value) return null;

      if (typeof value === 'string') {
        const parsed = parseISO(value);
        if (!(parsed instanceof Date) || Number.isNaN(parsed)) return null;
        return { iso: value, date: parsed };
      }

      if (value instanceof Date) {
        const iso = value.toISOString();
        return { iso, date: value };
      }

      if (typeof value.toDate === 'function') {
        try {
          const date = value.toDate();
          if (!(date instanceof Date) || Number.isNaN(date)) return null;
          return { iso: date.toISOString(), date };
        } catch {
          return null;
        }
      }

      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);

  const sortedDates = normalisedDateEntries.map((entry) => entry.iso);
  const holidayStart =
    isHolidayEvent && normalisedDateEntries.length ? normalisedDateEntries[0].date : null;
  const holidayEnd =
    isHolidayEvent && normalisedDateEntries.length
      ? normalisedDateEntries[normalisedDateEntries.length - 1].date
      : null;
  const formattedHolidayStart = holidayStart ? format(holidayStart, 'EEEE do MMMM yyyy') : '';
  const formattedHolidayEnd = holidayEnd ? format(holidayEnd, 'EEEE do MMMM yyyy') : '';
  const proposedDurationLabel = isHolidayEvent ? getHolidayDurationLabel(poll?.eventOptions?.proposedDuration) : '';


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
    const notifyAdminOnce = async () => {
      try {
        if (poll.adminNotified) return; // ✅ Prevent repeated emails

        const payload = {
          organiserName: poll.organiserFirstName || "Unknown",
          eventTitle: poll.eventTitle || poll.title || "Untitled Event",
          location: poll.location || "Unspecified",
          selectedDates: sortedDates,
          pollId: id,
          pollLink: `https://plan.setthedate.app/${isHolidayEvent ? 'trip' : 'poll'}/${id}`,
          eventType: poll.eventType || 'general',
          eventOptions: poll.eventOptions || null
        };

        await fetch('/api/notifyAdmin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // ✅ Mark as notified
        const docRef = doc(db, 'polls', id);
        await updateDoc(docRef, { adminNotified: true });
      } catch (err) {
        console.error("❌ Admin notify error:", err);
      }
    };
    notifyAdminOnce();
  }, [poll, id]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2500);
  };

  const share = (platform) => {
    const pollLink = `${baseURL}/${isHolidayEvent ? "trip" : "poll"}/${id}`;
    const organiser = poll.organiserFirstName || "someone";
    const eventTitle = capitalise(poll.eventTitle || poll.title || "an event");
    const location = poll.location || "somewhere";
    const shareMessage = isHolidayEvent && holidayStart && holidayEnd
      ? `Hey, you're invited to ${eventTitle} in ${location}. Proposed trip window ${formattedHolidayStart} to ${formattedHolidayEnd}${proposedDurationLabel ? ` (${proposedDurationLabel})` : ''}. Vote on what suits you: ${pollLink} - ${organiser}`
      : `Hey, you're invited to ${eventTitle} in ${location}. Vote on what day suits you now: ${pollLink} - hope to see you there! - ${organiser}`;

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
        <LogoHeader isPro={isProPoll} />

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

        <p className="text-center mb-4">{isHolidayEvent ? 'Share this travel window with your group:' : 'Invite your friends to vote on your event dates:'}</p>

        {isHolidayEvent ? (
          <div className="bg-blue-50 border border-blue-200 rounded p-4 text-center text-blue-800 mb-6 space-y-2">
            <p className="font-semibold">Proposed travel window</p>
            {holidayStart && holidayEnd ? (
              <p className="text-base">{formattedHolidayStart} to {formattedHolidayEnd}</p>
            ) : (
              <p className="text-sm">Add a range so everyone knows when to travel.</p>
            )}
            {proposedDurationLabel && (
              <p className="text-sm">Ideal trip length: {proposedDurationLabel}</p>
            )}
          </div>
        ) : sortedDates.length > 0 ? (
          <ul className="text-center text-gray-700 text-base font-medium mb-6 space-y-1">
            {sortedDates.map((date, index) => (
              <li key={index}>{format(parseISO(date), 'EEEE do MMMM yyyy')}</li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-sm text-gray-500 mb-6">Add a few dates so friends can vote.</p>
        )}

        <h2 className="text-xl font-semibold mb-4 text-center">Share Event with Friends</h2>
        <ShareButtonsLayout onShare={share} />

        <div className="text-center mt-8">
          <a href={`/${isHolidayEvent ? 'trip' : 'poll'}/${id}`} className="inline-block bg-black text-white px-4 py-2 rounded font-semibold hover:bg-gray-800 mt-6">
            Add Your Own Date Preferences
          </a>
        </div>

        <div className="text-center mt-10">
          <a href="https://buymeacoffee.com/setthedate" target="_blank" rel="noopener noreferrer" className="inline-block">
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





