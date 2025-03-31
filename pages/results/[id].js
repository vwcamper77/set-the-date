import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { format, parseISO } from "date-fns";
import confetti from "canvas-confetti";

export default function ResultsPage() {
  const router = useRouter();
  const { id } = router.query;

  const [poll, setPoll] = useState(null);
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");
  const hasFiredConfetti = useRef(false);

  useEffect(() => {
    if (!router.isReady || !id) return;

    const fetchData = async () => {
      try {
        const pollRef = doc(db, "polls", id);
        const pollSnap = await getDoc(pollRef);

        if (pollSnap.exists()) {
          setPoll(pollSnap.data());
        } else {
          console.error("Poll not found");
          setPoll(null);
        }

        const votesRef = collection(db, "polls", id, "votes");
        const votesSnap = await getDocs(votesRef);
        const allVotes = votesSnap.docs.map((doc) => doc.data());
        setVotes(allVotes);
      } catch (error) {
        console.error("Error fetching data:", error);
      }

      setLoading(false);
    };

    fetchData();
  }, [router.isReady, id]);

  useEffect(() => {
    if (!poll?.createdAt?.toDate) return;
    const createdAt = poll.createdAt.toDate();
    const deadline = new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000);

    const updateCountdown = () => {
      const now = new Date();
      const diff = deadline - now;
      if (diff <= 0) {
        setRevealed(true);
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

  if (loading) return <p className="p-4">Loading results...</p>;
  if (!poll) return <p className="p-4">Poll not found.</p>;

  const voteSummary = poll.dates.map((date) => {
    const yesNames = [], maybeNames = [], noNames = [];
    votes.forEach((v) => {
      const val = v.votes[date];
      if (val === "yes") yesNames.push(v.name);
      else if (val === "maybe") maybeNames.push(v.name);
      else if (val === "no") noNames.push(v.name);
    });
    return {
      date,
      yes: yesNames.length,
      maybe: maybeNames.length,
      no: noNames.length,
      yesNames,
      maybeNames,
      noNames,
    };
  });

  const sorted = [...voteSummary].sort((a, b) => b.yes - a.yes);
  const suggested = sorted[0];
  const organiser = poll.organiserFirstName || "Someone";
  const pollUrl = typeof window !== "undefined" ? window.location.origin + `/poll/${id}` : "";

  const share = (platform) => {
    const message = `Hey, you are invited for ${poll.eventTitle} evening out in ${poll.location}! Vote on what day suits you now! ${pollUrl}`;
    if (platform === "copy") {
      navigator.clipboard.writeText(pollUrl);
      alert("Link copied to clipboard!");
    } else if (platform === "whatsapp") {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`);
    } else {
      window.open(pollUrl);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <img src="/images/eveningout-logo.png" alt="Evening Out Logo" className="h-40 mx-auto mb-4" />

      <h1 className="text-2xl font-bold text-center mb-2">
        Suggested {poll.eventTitle} Date
      </h1>

      <div className="flex justify-center items-center gap-2 text-sm text-gray-700 mb-1">
        <img src="https://cdn-icons-png.flaticon.com/512/684/684908.png" alt="Location Icon" className="w-4 h-4" />
        <span>{poll.location}</span>
      </div>
      <p className="text-xs text-gray-500 italic text-center mb-2">
        📍 This is just a general area — the exact venue will be decided later!
      </p>

      {timeLeft && (
  <div className="text-center mb-4">
    <p className="text-lg text-blue-600 font-semibold">
      ⏳ {timeLeft}
    </p>
  </div>
)}
      {!revealed && (
        <div
          className="bg-green-100 border border-green-300 text-green-800 p-3 mb-4 rounded text-center font-semibold cursor-pointer hover:bg-green-200"
          onClick={handleReveal}
        >
          🎉 Sneak Peak to see the current winning date? Tap to reveal!
        </div>
      )}

      <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 p-3 mb-4 rounded text-center font-semibold">
        🎉 {organiser} is planning {poll.eventTitle} evening out — see how people voted!
      </div>

      {revealed && suggested && (
        <div className="mt-4 text-center bg-green-100 border border-green-300 text-green-800 p-4 rounded font-semibold text-lg animate-pulse">
          🎉 Your evening is currently set for {format(parseISO(suggested.date), "EEEE do MMMM yyyy")}!
        </div>
      )}

      {voteSummary.map((summary) => (
        <div key={summary.date} className="border p-4 mt-4 rounded">
          <h3 className="font-semibold mb-2">{format(parseISO(summary.date), "EEEE do MMMM yyyy")}</h3>
          <div className="grid grid-cols-3 text-center text-sm">
            <div>
              ✅ Can Attend<br />{summary.yes}<br />
              <span className="text-xs">{summary.yesNames.join(", ") || "-"}</span>
            </div>
            <div>
              🤔 Maybe<br />{summary.maybe}<br />
              <span className="text-xs">{summary.maybeNames.join(", ") || "-"}</span>
            </div>
            <div>
              ❌ No<br />{summary.no}<br />
              <span className="text-xs">{summary.noNames.join(", ") || "-"}</span>
            </div>
          </div>
        </div>
      ))}

      {/* Share Section */}
      <div className="mt-10 text-center">
        <h2 className="text-xl font-semibold mb-3">Share Event with Friends</h2>
        <div className="flex justify-center gap-4 items-center">
          <button onClick={() => share("whatsapp")} title="Share on WhatsApp">
            <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" className="w-8 h-8" />
          </button>
          <button onClick={() => share("discord")} title="Share on Discord">
            <img src="https://cdn-icons-png.flaticon.com/512/2111/2111370.png" alt="Discord" className="w-8 h-8" />
          </button>
          <button onClick={() => share("slack")} title="Share on Slack">
            <img src="https://cdn-icons-png.flaticon.com/512/2111/2111615.png" alt="Slack" className="w-8 h-8" />
          </button>
          <button onClick={() => share("copy")} title="Copy Link">
            <img src="https://cdn-icons-png.flaticon.com/512/1388/1388978.png" alt="Copy Link" className="w-8 h-8" />
          </button>
          <button onClick={() => share("email")} title="Email">
            <img src="https://cdn-icons-png.flaticon.com/512/732/732200.png" alt="Email" className="w-8 h-8" />
          </button>
        </div>

        <div className="mt-6 text-center">
          <a href="/" className="inline-flex items-center text-blue-600 font-semibold hover:underline">
            <img src="https://cdn-icons-png.flaticon.com/512/747/747310.png" alt="Calendar" className="w-5 h-5 mr-2" />
            Create Your Own Event
          </a>
        </div>

        <div className="mt-8">
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
  );
}