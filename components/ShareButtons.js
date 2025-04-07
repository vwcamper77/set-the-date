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
    <div className="flex flex-wrap justify-center gap-4 items-center mb-6">
      {/* WhatsApp */}
      <button onClick={() => handleShare('whatsapp', `https://api.whatsapp.com/send?text=${encodedMessage}`)}>
        <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" className="w-8 h-8" />
      </button>

      {/* Email */}
      <button onClick={() => handleShare('email', `mailto:?subject=Set%20The%20Date&body=${encodedMessage}`)}>
        <img src="https://cdn-icons-png.flaticon.com/512/732/732200.png" alt="Email" className="w-8 h-8" />
      </button>

      {/* SMS (with proper phone icon) */}
      <button onClick={() => handleShare('sms', `sms:?body=${encodedMessage}`)}>
        <img src="https://cdn-icons-png.flaticon.com/512/2462/2462719.png" alt="SMS" className="w-8 h-8" />
      </button>

      {/* Copy Link */}
      <button onClick={handleCopyLink}>
        <img src="https://cdn-icons-png.flaticon.com/512/1388/1388978.png" alt="Copy Link" className="w-8 h-8" />
      </button>
    </div>
  );
}
