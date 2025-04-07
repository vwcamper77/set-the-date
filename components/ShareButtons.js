// components/ShareButtons.js
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

export default function ShareButtons({
  shareUrl = "https://plan.setthedate.app",
  shareMessage = "Plan your next event with friends — no more group chat chaos! https://plan.setthedate.app",
  onShare = null,
}) {
  const encodedMessage = encodeURIComponent(shareMessage);
  const encodedUrl = encodeURIComponent(shareUrl);

  const handleShare = (platform, url) => {
    if (onShare) onShare(platform);
    else logEventIfAvailable('shared_landing_page', { platform });

    window.open(url, '_blank');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    alert("Link copied to clipboard!");
    if (onShare) onShare('copy_link');
    else logEventIfAvailable('shared_landing_page', { platform: 'copy_link' });
  };

  return (
    <div className="flex justify-center gap-4 items-center mb-6">
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

      <button onClick={() => handleShare('twitter', `https://x.com/intent/tweet?text=${encodedMessage}`)}>
        <img src="https://cdn-icons-png.flaticon.com/512/5968/5968958.png" alt="X / Twitter" className="w-8 h-8" />
      </button>

      <button onClick={() => handleShare('facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)}>
        <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="Facebook" className="w-8 h-8" />
      </button>

      <button onClick={() => handleShare('email', `mailto:?subject=Check%20this%20out&body=${encodedMessage}`)}>
        <img src="https://cdn-icons-png.flaticon.com/512/732/732200.png" alt="Email" className="w-8 h-8" />
      </button>

      <button onClick={handleCopyLink}>
        <img src="https://cdn-icons-png.flaticon.com/512/1388/1388978.png" alt="Copy Link" className="w-8 h-8" />
      </button>
    </div>
  );
}
