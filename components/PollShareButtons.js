// components/PollShareButtons.js
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

export default function PollShareButtons({ pollUrl, organiser, eventTitle, location, onShare }) {
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

  const handleShare = (platform, url) => {
    if (onShare) onShare(platform);
    else logEventIfAvailable('shared_poll', { platform }); // fallback if onShare isn't passed
    window.open(url);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(pollUrl);
    alert('Link copied to clipboard!');
    if (onShare) onShare('copy');
    else logEventIfAvailable('shared_poll', { platform: 'copy' });
  };

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold mb-3 text-center">Share This Poll With Friends</h2>
      <div className="flex flex-wrap justify-center gap-4 items-center">
        <button onClick={() => handleShare('whatsapp', `https://api.whatsapp.com/send?text=${encodedMessage}`)}>
          <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" className="w-8 h-8" />
        </button>

        <button onClick={() => handleShare('telegram', `https://t.me/share/url?url=${encodedUrl}&text=${encodedMessage}`)}>
          <img src="https://cdn-icons-png.flaticon.com/512/2111/2111644.png" alt="Telegram" className="w-8 h-8" />
        </button>

        <button onClick={() => handleShare('slack', 'https://slack.com/')}>
          <img src="https://cdn-icons-png.flaticon.com/512/2111/2111615.png" alt="Slack" className="w-8 h-8" />
        </button>

        <button onClick={() => handleShare('discord', 'https://discord.com/channels/@me')}>
          <img src="https://cdn-icons-png.flaticon.com/512/2111/2111370.png" alt="Discord" className="w-8 h-8" />
        </button>

        <button onClick={() => handleShare('x', `https://x.com/intent/tweet?text=${encodedMessage}`)}>
          <img src="https://cdn-icons-png.flaticon.com/512/5968/5968958.png" alt="X" className="w-8 h-8" />
        </button>

        <button onClick={() => handleShare('facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)}>
          <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="Facebook" className="w-8 h-8" />
        </button>

        <button onClick={() => handleShare('email', `mailto:?subject=${emailSubject}&body=${emailBody}`)}>
          <img src="https://cdn-icons-png.flaticon.com/512/732/732200.png" alt="Email" className="w-8 h-8" />
        </button>

        <button onClick={handleCopyLink}>
          <img src="https://cdn-icons-png.flaticon.com/512/1388/1388978.png" alt="Copy Link" className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
}
