// components/ShareButtons.js

export default function ShareButtons({
    shareUrl = "https://plan.setthedate.app",
    shareMessage = "Plan your next event with friends — no more group chat chaos! https://plan.setthedate.app",
  }) {
    // Encode for share queries
    const encodedMessage = encodeURIComponent(shareMessage);
    const encodedUrl = encodeURIComponent(shareUrl);
  
    // Copy function
    const handleCopyLink = () => {
      navigator.clipboard.writeText(shareUrl);
      alert("Link copied to clipboard!");
    };
  
    return (
      <div className="flex justify-center gap-4 items-center mb-6">
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
  
        {/* X / Twitter */}
        <button onClick={() => window.open(`https://x.com/intent/tweet?text=${encodedMessage}`)}>
          <img
            src="https://cdn-icons-png.flaticon.com/512/5968/5968958.png"
            alt="X / Twitter"
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
        <button onClick={() => window.open(`mailto:?subject=Check%20this%20out&body=${encodedMessage}`)}>
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
    );
  }
  