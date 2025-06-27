import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Script from 'next/script';
import { nanoid } from 'nanoid';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

const DateSelector = dynamic(() => import('@/components/DateSelector'), { ssr: false });
const MapboxAutocomplete = dynamic(() => import('@/components/MapboxAutocomplete'), { ssr: false });

import ShareButtons from '@/components/ShareButtons';
import BuyMeACoffee from '@/components/BuyMeACoffee';
import LogoHeader from '@/components/LogoHeader';

export default function Home() {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);
  const [deadlineHours, setDeadlineHours] = useState(168);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entrySource, setEntrySource] = useState('unknown');
  const [votingDeadlineDate, setVotingDeadlineDate] = useState('');
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source');
    if (source) {
      sessionStorage.setItem('entrySource', source);
      setEntrySource(source);
    } else {
      const storedSource = sessionStorage.getItem('entrySource');
      if (storedSource) setEntrySource(storedSource);
    }
  }, []);

  useEffect(() => {
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + deadlineHours);
    setVotingDeadlineDate(format(deadline, "EEEE d MMMM yyyy, h:mm a"));
  }, [deadlineHours]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firstName || !email || !title || !location || selectedDates.length === 0) {
      alert("Please fill in all fields and select at least one date.");
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const finalLocation = location.trim();

      // ✅ Fix: ensure ISO format and chronological sort
      const formattedDates = selectedDates
        .slice()
        .sort((a, b) => a - b)
        .map((date) => date.toISOString());

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
        entrySource: entrySource || 'unknown',
      };

      const t0 = performance.now();
      const docRef = await addDoc(collection(db, "polls"), pollData);
      const t1 = performance.now();
      console.log(`⏱️ Firestore addDoc() took ${Math.round(t1 - t0)}ms`);
      console.log("⏳ Starting background tasks");

      router.replace(`/share/${docRef.id}`);

      setTimeout(() => {
        logEventIfAvailable('poll_created', {
          organiserName: firstName,
          email,
          eventTitle: title,
          location: finalLocation,
          selectedDateCount: formattedDates.length,
          deadlineHours,
          pollId: docRef.id,
          entrySource,
        });

        fetch("/api/sendOrganiserLaunchEmails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName,
            email,
            pollId: docRef.id,
            editToken,
            eventTitle: title
          })
        });

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
        });

        import("canvas-confetti").then((mod) => {
          mod.default({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 },
          });
        });
      }, 0);
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
      </Head>

      {process.env.NEXT_PUBLIC_GTM_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GTM_ID}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${process.env.NEXT_PUBLIC_GTM_ID}');
            `}
          </Script>
        </>
      )}

      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full p-6">
          <LogoHeader />
          <div className="text-center mb-2">
            <h1 className="text-xl font-semibold text-center leading-tight">
              Find the <strong>Best</strong> Date<br />
              for Your Next Get Together
            </h1>
            <p className="text-sm text-gray-600 italic mt-1">
              “Just like <strong>Calendly</strong> — but made for groups.”
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block font-semibold mt-4 text-center">⬇️ Choose a few possible dates ⬇️</label>
            <div className="flex justify-center">
              <DateSelector selectedDates={selectedDates} setSelectedDates={setSelectedDates} />
            </div>
            <input type="text" className="w-full border p-2 rounded" placeholder="Your first name (e.g. Jamie)" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            <input type="email" className="w-full border p-2 rounded" placeholder="Your email (we’ll send you the link)" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="text" className="w-full border p-2 rounded" placeholder="Event title (e.g. Friday Drinks)" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <MapboxAutocomplete setLocation={setLocation} />
            <p className="text-xs text-gray-500 italic mt-1 text-center">📍 General area only — the exact venue can come later!</p>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">⏱ How long should voting stay open?</label>
              <select value={deadlineHours} onChange={(e) => setDeadlineHours(Number(e.target.value))} className="w-full border p-2 rounded">
                <option value={24}>1 day</option>
                <option value={48}>2 days</option>
                <option value={72}>3 days</option>
                <option value={168}>1 week (default)</option>
                <option value={336}>2 weeks</option>
              </select>
              <p className="text-xs text-gray-500 mt-1 italic text-center">
                Voting closes on <strong>{votingDeadlineDate}</strong>
              </p>
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
