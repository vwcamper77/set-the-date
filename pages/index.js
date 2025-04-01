import { useState } from 'react'; 
import { useRouter } from 'next/router';
import { db } from '../lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import DateSelector from '../components/DateSelector';
import MapboxAutocomplete from '../components/MapboxAutocomplete';
import confetti from "canvas-confetti";
import Head from 'next/head';
import { nanoid } from 'nanoid';

export default function Home() {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!firstName || !email || !title || !location || selectedDates.length === 0) {
      alert("Please fill in all fields and select at least one date.");
      return;
    }

    let finalLocation = location;
    if (location.includes(",")) {
      const parts = location.split(",").slice(0, 2);
      finalLocation = parts.map((p) => p.trim()).join(", ");
    }

    const formattedDates = selectedDates.map((date) => format(date, "yyyy-MM-dd"));
    const editToken = nanoid(32); // Secure token for editing

    try {
      const pollData = {
        organiserFirstName: firstName,
        organiserLastName: '',
        organiserEmail: email,
        eventTitle: title,
        location: finalLocation,
        dates: formattedDates,
        createdAt: Timestamp.now(),
        editToken,
      };

      const docRef = await addDoc(collection(db, "polls"), pollData);

      await fetch("/api/sendOrganiserEmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          email,
          pollId: docRef.id,
          editToken,
          eventTitle: title,
        }),
      });

      fetch("/api/notifyAdmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          eventTitle: title,
          location: finalLocation,
          selectedDates: formattedDates,
          pollId: docRef.id,
        }),
      }).catch((err) => {
        console.warn("⚠️ Failed to notify admin:", err);
      });

      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });

      setTimeout(() => {
        window.location.replace(`/share/${docRef.id}`);
      }, 500);
    } catch (error) {
      console.error("❌ Error creating poll:", error);
      alert("Something went wrong. Please try again.");
    }
  };

  return (
    <>
      <Head>
        <title>Plan Your Evening Out</title>
        <meta property="og:title" content="Plan an Evening Out with Friends" />
        <meta property="og:description" content="Suggest dates, vote together, and pick the best one." />
        <meta property="og:image" content="https://plan.eveningout.social/logo.png" />
        <meta property="og:url" content="https://plan.eveningout.social" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full p-6">
          <img src="/images/eveningout-logo.png" alt="Evening Out Logo" className="h-40 mx-auto mb-6" />

          <h1 className="text-2xl font-bold mb-2 text-center">
            Quickly Plan Your Next Evening Out
          </h1>
          <p className="text-sm text-center text-gray-600 italic mb-5">
            “Just like Calendly—but built specifically for groups of friends. No more endless WhatsApp threads!”
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              className="w-full border p-2 rounded"
              placeholder="Your first name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <input
              type="email"
              className="w-full border p-2 rounded"
              placeholder="Your email (so we can send you the link)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="text"
              className="w-full border p-2 rounded"
              placeholder="Event Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <MapboxAutocomplete setLocation={setLocation} />
            <p className="text-xs text-gray-500 italic mt-1">
              📍 This is just a general area — the exact venue will be decided later!
            </p>

            <label className="block font-semibold mt-4 text-center">
              Pick your dates:
            </label>
            <div className="flex justify-center">
              <DateSelector
                selectedDates={selectedDates}
                setSelectedDates={setSelectedDates}
              />
            </div>

            <button
              type="submit"
              className="w-full bg-black text-white font-semibold py-2 mt-4 rounded"
            >
              Launch Your Evening Out
            </button>
          </form>

          <div className="mt-10 text-center">
            <h2 className="text-xl font-semibold mb-3">Share This App</h2>
            <p className="text-sm text-gray-600 mb-4">Let your friends know they can use Evening Out too!</p>

            <div className="flex justify-center gap-4 items-center mb-6">
              <button onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent("Check out this awesome tool to quickly plan group nights out 🎉 https://plan.eveningout.social")}`)}>
                <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" className="w-8 h-8" />
              </button>
              <button onClick={() => window.open(`https://discord.com/channels/@me`)}>
                <img src="https://cdn-icons-png.flaticon.com/512/2111/2111370.png" alt="Discord" className="w-8 h-8" />
              </button>
              <button onClick={() => window.open(`https://slack.com/`)}>
                <img src="https://cdn-icons-png.flaticon.com/512/2111/2111615.png" alt="Slack" className="w-8 h-8" />
              </button>
              <button onClick={() => window.open(`https://x.com/intent/tweet?text=${encodeURIComponent("Quickly plan your next night out with friends — no more group chat chaos 🎉 https://plan.eveningout.social")}`)}>
                <img src="https://cdn-icons-png.flaticon.com/512/5968/5968958.png" alt="Twitter/X" className="w-8 h-8" />
              </button>
              <button onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=https://plan.eveningout.social`)}>
                <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="Facebook" className="w-8 h-8" />
              </button>
              <button onClick={() => { navigator.clipboard.writeText("https://plan.eveningout.social"); alert("Link copied to clipboard!"); }}>
                <img src="https://cdn-icons-png.flaticon.com/512/1388/1388978.png" alt="Copy Link" className="w-8 h-8" />
              </button>
            </div>
          </div>

          <div className="text-center mt-10">
            <a
              href="https://buymeacoffee.com/eveningout"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
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
