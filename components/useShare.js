// hooks/useShare.js
export const useShare = (pollUrl, organiser, eventTitle, location) => {
    return (platform) => {
      const shareMessage = `Hey, you're invited for ${eventTitle} in ${location}! Vote now: ${pollUrl}\n\nHope to see you there!\n– ${organiser}`;
      navigator.clipboard.writeText(pollUrl);
  
      if (platform === 'whatsapp') {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`, '_blank');
      } else if (platform === 'email') {
        const subject = encodeURIComponent(`${organiser} invites you to ${eventTitle} in ${location}`);
        const body = encodeURIComponent(`${shareMessage}`);
        window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
      } else {
        window.open(pollUrl, '_blank');
      }
    };
  };
  