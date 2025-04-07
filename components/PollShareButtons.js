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
    else logEventIfAvailable('shared_poll', { platform });
    window.open(url, '_blank');
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
      <div className="flex flex-wrap justify-center gap-4 items-center mb-6">
        {/* WhatsApp */}
        <button onClick={() => handleShare('whatsapp', `https://api.whatsapp.com/send?text=${encodedMessage}`)}>
          <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" className="w-8 h-8" />
        </button>

        {/* Email */}
        <button onClick={() => handleShare('email', `mailto:?subject=${emailSubject}&body=${emailBody}`)}>
          <img src="https://cdn-icons-png.flaticon.com/512/732/732200.png" alt="Email" className="w-8 h-8" />
        </button>

        {/* SMS */}
        <button onClick={() => handleShare('sms', `sms:?body=${encodedMessage}`)}>
          <img src="https://cdn-icons-png.flaticon.com/512/2462/2462719.png" alt="SMS" className="w-8 h-8" />
        </button>

        {/* Copy Link */}
        <button onClick={handleCopyLink}>
          <img src="https://cdn-icons-png.flaticon.com/512/1388/1388978.png" alt="Copy Link" className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
}
