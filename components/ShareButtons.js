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

  const handleCopyLink = (platform = 'copy_link') => {
    navigator.clipboard.writeText(shareUrl);
    alert(`Link copied! Paste it in ${platform}.`);
    if (onShare) onShare(platform);
    else logEventIfAvailable('shared_landing_page', { platform });
  };

  return (
    <div className="flex flex-wrap justify-center gap-4 items-center mb-6">
      {/* 1. WhatsApp */}
      <button onClick={() => handleShare('whatsapp', `https://api.whatsapp.com/send?text=${encodedMessage}`)} title="Share via WhatsApp">
        <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" className="w-8 h-8" />
      </button>

      {/* 2. Email */}
      <button onClick={() => handleShare('email', `mailto:?subject=Set%20The%20Date&body=${encodedMessage}`)} title="Share via Email">
        <img src="https://cdn-icons-png.flaticon.com/512/732/732200.png" alt="Email" className="w-8 h-8" />
      </button>

      {/* 3. Discord (copy) */}
      <button onClick={() => handleCopyLink('discord')} title="Copy to share in Discord">
        <img src="https://cdn-icons-png.flaticon.com/512/5968/5968756.png" alt="Discord" className="w-8 h-8" />
      </button>

      {/* 4. Slack (copy) */}
      <button onClick={() => handleCopyLink('slack')} title="Copy to share in Slack">
        <img src="https://cdn-icons-png.flaticon.com/512/2111/2111615.png" alt="Slack" className="w-8 h-8" />
      </button>

      {/* 5. SMS (mobile only) */}
      <div className="block sm:hidden">
        <button onClick={() => handleShare('sms', `sms:?body=${encodedMessage}`)} title="Share via SMS">
          <img src="https://cdn-icons-png.flaticon.com/512/2462/2462719.png" alt="SMS" className="w-8 h-8" />
        </button>
      </div>

      {/* 6. Copy Link */}
      <button onClick={() => handleCopyLink()} title="Copy Link">
        <img src="https://cdn-icons-png.flaticon.com/512/1388/1388978.png" alt="Copy Link" className="w-8 h-8" />
      </button>
    </div>
  );
}
