import { useState } from 'react';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { nanoid } from 'nanoid';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable'; // ✅ Safe GA wrapper

const DateSelector = dynamic(() => import('@/components/DateSelector'), { ssr: false });

import MapboxAutocomplete from '@/components/MapboxAutocomplete';
import ShareButtons from '@/components/ShareButtons';
import BuyMeACoffee from '@/components/BuyMeACoffee';
import LogoHeader from '@/components/LogoHeader';

export default function Home() {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);
  const [deadlineHours, setDeadlineHours] = useState(72);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!firstName || !email || !title || !location || selectedDates.length === 0) {
      alert("Please fill in all fields and select at least one date.");
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    let finalLocation = location;
    if (location.includes(",")) {
      const parts = location.split(",").slice(0, 2);
      finalLocation = parts.map((p) => p.trim()).join(", ");
    }

    const formattedDates = selectedDates.map((date) => format(date, "yyyy-MM-dd"));
    const editToken = nanoid(32);
    const deadlineTimestamp = Timestamp.fromDate(new Date(Date.now() + deadlineHours * 60 * 60 * 1000));

    const pollData = {
      organiserFirstName: firstName,
      organiserLastName: '',
      organiserEmail: email,
      eventTitle: title,
      location: finalLocation,
      dates: formattedDates,
      createdAt: Timestamp.now(),
      deadline: deadlineTimestamp,
      editToken,
    };

    try {
      const docRef = await addDoc(collection(db, "polls"), pollData);

      // ✅ Track safely
      logEventIfAvailable('poll_created', {
        organiserName: firstName,
        email,
        eventTitle: title,
        location: finalLocation,
        selectedDateCount: formattedDates.length,
        deadlineHours,
        pollId: docRef.id
      });

      // ✅ Instant redirect
      router.replace(`/share/${docRef.id}`);

      // ✅ Confetti celebration
      if (typeof window !== 'undefined') {
        import("canvas-confetti").then((mod) => {
          const confetti = mod.default;
          confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 },
          });
        });
      }

      // 🔄 Email organiser
      fetch("/api/sendOrganiserEmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, email, pollId: docRef.id, editToken, eventTitle: title }),
      });

      // 🔄 Notify admin
      fetch("/api/notifyAdmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organiserName: firstName,
          eventTitle: title,
          location: finalLocation,
          selectedDates: formattedDates,
          pollId: docRef.id,
          pollLink: `https://plan.setthedate.app/poll/${docRef.id}`
        }),
      }).catch((err) => console.warn("⚠️ Failed to notify admin:", err));

    } catch (error) {
      console.error("❌ Error creating poll:", error);
      alert("Something went wrong. Please try again.");
    }
  };

  return (
    <>
      <Head>
        <title>Set The Date – Group Planning Made Easy</title>
        <meta name="description" content="No more group chat chaos – just pick a few dates, share a link, and let friends vote." />
        <meta property="og:title" content="Set The Date – Find the Best Day for Any Event" />
        <meta property="og:description" content="Quickly find the best date for your next night out, baby shower, team event, or dinner." />
        <meta property="og:url" content="https://plan.setthedate.app/" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://plan.setthedate.app/og-image.png" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Set The Date – Pick a Date. Make It Happen. Logo with calendar and sparkles" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Set The Date – Find the Best Day for Any Event" />
        <meta name="twitter:description" content="Quickly find the best date for your next night out, baby shower, team event, or dinner." />
        <meta name="twitter:image" content="https://plan.setthedate.app/og-image.png" />
      </Head>

      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full p-6">
          <LogoHeader />

          <div className="text-center mb-2">
            <h1 className="text-xl font-semibold text-center leading-tight">
              Find the <strong>Best</strong> Date<br />
              for Your Next Get Together
            </h1>
            <p className="text-sm text-gray-600 italic mt-1">
              “Just like <strong>Calendly</strong> — but made for groups. Pick some dates, <strong>share link</strong>, let your friends or colleagues vote.”
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block font-semibold mt-4 text-center">⬇️ Choose a few possible dates ⬇️</label>
            <div className="flex justify-center">
              <DateSelector selectedDates={selectedDates} setSelectedDates={setSelectedDates} />
            </div>

            <input
              type="text"
              className="w-full border p-2 rounded"
              placeholder="Your first name (e.g. Jamie)"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <input
              type="email"
              className="w-full border p-2 rounded"
              placeholder="Your email (we’ll send you the link)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="text"
              className="w-full border p-2 rounded"
              placeholder="Event title (e.g. Friday Drinks)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <MapboxAutocomplete setLocation={setLocation} />
            <p className="text-xs text-gray-500 italic mt-1 text-center">📍 General area only — the exact venue can come later!</p>

            <div className="text-center mt-2">
              <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="text-sm text-blue-600 underline">⚙️ Advanced Options</button>
              {showAdvanced && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">⏱ Voting Deadline</label>
                  <select value={deadlineHours} onChange={(e) => setDeadlineHours(Number(e.target.value))} className="w-full border p-2 rounded">
                    <option value={24}>24 hours</option>
                    <option value={48}>48 hours</option>
                    <option value={72}>72 hours (default)</option>
                    <option value={168}>1 week</option>
                  </select>
                </div>
              )}
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full bg-black text-white font-semibold py-3 mt-4 rounded hover:bg-gray-800 transition">
              {isSubmitting ? 'Creating...' : 'Start Planning'}
            </button>
          </form>

          <div className="mt-10 text-center">
            <h2 className="text-xl font-semibold mb-3">Share Set The Date</h2>
            <p className="text-sm text-gray-600 mb-4">Let your friends know they can use Set The Date too!</p>
            <ShareButtons onShare={() => logEventIfAvailable('organiser_shared_poll')} />
          </div>

          <BuyMeACoffee />
        </div>
      </div>
    </>
  );
}
