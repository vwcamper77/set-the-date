// components/PollShareButtons.js

export default function PollShareButtons({ pollUrl, organiser, eventTitle, location }) {
    const shareMessage = `Vote for a date for "${eventTitle}" with ${organiser}! Cast your vote here: ${pollUrl}`;
    const encodedMessage = encodeURIComponent(shareMessage);
    const encodedUrl = encodeURIComponent(pollUrl);
  
    const emailSubject = encodeURIComponent(
      `You're invited to "${eventTitle}" with ${organiser} in ${location} 🎉`
    );
  
    const emailBody = encodeURIComponent(
      `Hey there 👋,
  
  ${organiser} is organising a get-together called "${eventTitle}" in ${location} — and would love your input on what date works best! 🗓️
  
  👉 Tap to vote now:
  ${pollUrl}
  
  Thanks so much for helping make it happen!
  
  — The Set The Date Team ✨
  
  🪄 Want to plan your own event?
  https://plan.setthedate.app`
    );
  
    const handleCopyLink = () => {
      navigator.clipboard.writeText(pollUrl);
      alert("Link copied to clipboard!");
    };
  
    return (
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-3 text-center">Share This Poll With Friends</h2>
        <div className="flex flex-wrap justify-center gap-4 items-center">
          {/* WhatsApp */}
          <button onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodedMessage}`)}>
            <img
              src="https://cdn-icons-png.flaticon.com/512/733/733585.png"
              alt="WhatsApp"
              className="w-8 h-8"
            />
          </button>
  
          {/* Telegram */}
          <button onClick={() => window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodedMessage}`)}>
            <img
              src="https://cdn-icons-png.flaticon.com/512/2111/2111644.png"
              alt="Telegram"
              className="w-8 h-8"
            />
          </button>
  
          {/* Slack */}
          <button onClick={() => window.open("https://slack.com/")}>
            <img
              src="https://cdn-icons-png.flaticon.com/512/2111/2111615.png"
              alt="Slack"
              className="w-8 h-8"
            />
          </button>
  
          {/* Discord */}
          <button onClick={() => window.open("https://discord.com/channels/@me")}>
            <img
              src="https://cdn-icons-png.flaticon.com/512/2111/2111370.png"
              alt="Discord"
              className="w-8 h-8"
            />
          </button>
  
          {/* X (Twitter) */}
          <button onClick={() => window.open(`https://x.com/intent/tweet?text=${encodedMessage}`)}>
            <img
              src="https://cdn-icons-png.flaticon.com/512/5968/5968958.png"
              alt="X"
              className="w-8 h-8"
            />
          </button>
  
          {/* Facebook */}
          <button onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)}>
            <img
              src="https://cdn-icons-png.flaticon.com/512/733/733547.png"
              alt="Facebook"
              className="w-8 h-8"
            />
          </button>
  
          {/* Email */}
          <button onClick={() =>
            window.open(`mailto:?subject=${emailSubject}&body=${emailBody}`)
          }>
            <img
              src="https://cdn-icons-png.flaticon.com/512/732/732200.png"
              alt="Email"
              className="w-8 h-8"
            />
          </button>
  
          {/* Copy Link */}
          <button onClick={handleCopyLink}>
            <img
              src="https://cdn-icons-png.flaticon.com/512/1388/1388978.png"
              alt="Copy Link"
              className="w-8 h-8"
            />
          </button>
        </div>
      </div>
    );
  }
  