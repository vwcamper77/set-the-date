// ✅ Updated /pages/poll/[id].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
  doc,
  getDoc,
} from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import Head from 'next/head';

export async function getServerSideProps(context) {
  const { id } = context.params;
  const pollRef = doc(db, "polls", id);
  const pollSnap = await getDoc(pollRef);

  if (!pollSnap.exists()) {
    return {
      notFound: true,
    };
  }

  const data = pollSnap.data();
  const poll = {
    ...data,
    createdAt: data.createdAt?.toDate().toISOString() || null,
  };
  
  return {
    props: {
      poll,
      id,
    },
  };
}

export default function PollPage({ poll, id }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [votes, setVotes] = useState({});
  const [timeLeft, setTimeLeft] = useState("");
  const [votingClosed, setVotingClosed] = useState(false);

  const organiser = poll?.organiserFirstName || "Someone";
  const eventTitle = poll?.eventTitle || poll?.title || "an event";
  const location = poll?.location || "somewhere";
  const pollUrl = `https://plan.eveningout.social/poll/${id}`;

  const shareMessage = `Hey, you are invited for ${eventTitle} evening out in ${location}! Vote on what day suits you now! 👉 ${pollUrl}`;
  



  useEffect(() => {
    if (!poll?.createdAt) return;
    const createdAt = new Date(poll.createdAt);
    const deadline = new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000);
  
    const updateCountdown = () => {
      const now = new Date();
      const diff = deadline - now;
      if (diff <= 0) {
        setVotingClosed(true);
        setTimeLeft("Voting has closed");
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const seconds = Math.floor((diff / 1000) % 60);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s left to vote`);
      }
    };
  
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [poll]);
  

  const handleVoteChange = (date, value) => {
    setVotes((prev) => ({ ...prev, [date]: value }));
  };

  const handleSubmit = async () => {
    console.log("👉 handleSubmit triggered");
  
    // 🔍 Log values before anything happens
    console.log("🧠 Name:", name, "| Email:", email, "| Votes:", votes);
  
    if (!name.trim()) {
      alert("Please enter your name.");
      return;
    }
  
    const missingVotes = poll.dates.filter((date) => !votes[date]);
    if (missingVotes.length > 0) {
      alert("Please select your availability for all dates.");
      return;
    }
  
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert("Please enter a valid email address.");
      return;
    }
  
    try {
      const voteData = {
        name,
        email,
        votes,
        createdAt: serverTimestamp(),
      };
  
      console.log("📥 Writing to Firestore…");
  
      await addDoc(collection(db, "polls", id, "votes"), voteData)
        .then((docRef) => console.log("✅ Vote saved:", docRef.id))
        .catch((err) => {
          console.error("🔥 Firestore write failed!", err);
          alert("Vote could not be saved.");
        });
  
      // Proceed to results manually for now
      alert("✅ Vote submitted! Please tap 'See Results' below.");
  
      // Optional: fire-and-forget email in background
      if (email) {
        fetch("/api/sendAttendeeEmail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            eventTitle: poll.eventTitle || poll.title,
            organiserFirstName: poll.organiserFirstName,
            pollId: id,
          }),
        }).catch((err) => console.error("⚠️ Email error:", err));
      }
    } catch (err) {
      console.error("❌ Unexpected error during vote submit:", err);
      alert("Something went wrong. Please try again.");
    }
  };
  
  

  const share = (platform) => {
    navigator.clipboard.writeText(pollUrl);
    if (platform === "whatsapp") {
      window.open(
        `https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`,
        "_blank"
      );
    } else if (platform === "email") {
      const subject = encodeURIComponent(
        `${organiser} invites you to ${eventTitle} in ${location}`
      );
      const body = encodeURIComponent(
        `${shareMessage}\n\nHope to see you there!\n– ${organiser}`
      );
      window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
    } else {
      window.open(pollUrl, "_blank");
    }
  };

  return (
    <>
      <Head>
        <title>{`${organiser} is planning ${eventTitle} in ${location}`}</title>
        <meta
          property="og:title"
          content={`${organiser} is planning ${eventTitle} in ${location}`}
        />
        <meta
          property="og:description"
          content={`Vote now to help choose a date for ${eventTitle}`}
        />
        <meta
          property="og:image"
          content="https://plan.eveningout.social/logo.png"
        />
        <meta property="og:url" content={pollUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div className="max-w-md mx-auto p-4">
        <img
          src="/images/eveningout-logo.png"
          alt="Evening Out Logo"
          className="h-40 mx-auto mb-4"
        />

        <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 p-3 mb-4 rounded text-center font-semibold">
          🎉 {organiser} is planning {eventTitle} evening out — add which dates
          work for you!
        </div>

        <div className="flex items-center justify-center gap-2 mb-3 text-sm text-gray-700 font-medium">
          <img
            src="https://cdn-icons-png.flaticon.com/512/684/684908.png"
            alt="Location Icon"
            className="w-4 h-4"
          />
          <span>{location}</span>
        </div>

        <p className="text-xs text-gray-500 italic text-center mb-4">
          📍 This is just a general area — the exact venue will be decided later!
        </p>

        {timeLeft && (
          <div className="text-center mb-4">
            <p className="text-lg text-blue-600 font-semibold">⏳ {timeLeft}</p>
          </div>
        )}

        {poll.dates.map((date) => (
          <div key={date} className="border p-4 mb-4 rounded">
            <div className="font-semibold mb-2">
              {format(parseISO(date), "EEEE do MMMM yyyy")}
            </div>
            <div className="flex justify-between items-center text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={date}
                  value="yes"
                  onChange={() => handleVoteChange(date, "yes")}
                />
                ✅ Can Attend
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={date}
                  value="maybe"
                  onChange={() => handleVoteChange(date, "maybe")}
                />
                🤔 Maybe
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={date}
                  value="no"
                  onChange={() => handleVoteChange(date, "no")}
                />
                ❌ No
              </label>
            </div>
          </div>
        ))}

        <input
          type="text"
          placeholder="Your Nickname or First Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-3 p-2 border rounded"
          required
        />

        <input
          type="email"
          placeholder="Your email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-3 p-2 border rounded"
        />
        <p className="text-xs text-gray-600 italic mb-4">
          We’ll send you the confirmed date!
        </p>

        {!votingClosed && (
          <button
            onClick={handleSubmit}
            className="bg-black text-white px-4 py-2 rounded w-full font-semibold"
          >
            Submit Votes
          </button>
        
        )}
        

<button
  onClick={() => router.push(`/results/${id}`)}
  className="mt-4 border border-black text-black px-4 py-2 rounded w-full font-semibold"
>
  See Results
</button>



        <div className="mt-10 text-center">
          <h2 className="text-xl font-semibold mb-3">Share Event with Friends</h2>
         <div className="flex justify-center gap-4 items-center">
            <button onClick={() => share("whatsapp")} title="Share on WhatsApp">
              <img
                src="https://cdn-icons-png.flaticon.com/512/733/733585.png"
                alt="WhatsApp"
                className="w-8 h-8"
              />
            </button>
            <button onClick={() => share("discord")} title="Share on Discord">
              <img
                src="https://cdn-icons-png.flaticon.com/512/2111/2111370.png"
                alt="Discord"
                className="w-8 h-8"
              />
            </button>
            <button onClick={() => share("slack")} title="Share on Slack">
              <img
                src="https://cdn-icons-png.flaticon.com/512/2111/2111615.png"
                alt="Slack"
                className="w-8 h-8"
              />
            </button>
            <button onClick={() => share("copy")} title="Copy Link">
              <img
                src="https://cdn-icons-png.flaticon.com/512/1388/1388978.png"
                alt="Copy Link"
                className="w-8 h-8"
              />
            </button>
            <button onClick={() => share("email")} title="Share via Email">
              <img
                src="https://cdn-icons-png.flaticon.com/512/732/732200.png"
                alt="Email"
                className="w-8 h-8"
              />
            </button>
          </div>

          <div className="mt-6 text-center">
            <a
              href="/"
              className="inline-flex items-center text-blue-600 font-semibold hover:underline"
            >
              <img
                src="https://cdn-icons-png.flaticon.com/512/747/747310.png"
                alt="Calendar"
                className="w-5 h-5 mr-2"
              />
              Create Your Own Event
            </a>
          </div>

          <div className="mt-10">
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
