export const getShareMessage = (context, poll) => {
    const organiser = poll.organiserFirstName || 'Someone';
    const eventTitle = poll.eventTitle || 'an event';
    const location = poll.location || 'somewhere';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://plan.setthedate.app';
    const pollUrl = `${baseUrl}/poll/${poll.id || poll.pollId || ''}`;
  
    if (context === 'poll') {
      return `Hey, you're invited to ${eventTitle} in ${location}!\nVote for the best date here 👉 ${pollUrl}`;
    }
  
    if (context === 'results') {
      return `Here are the results for ${eventTitle} in ${location}!\nSee how people voted 👉 ${pollUrl}`;
    }
  
    if (context === 'organiser') {
      return `${organiser} is planning ${eventTitle} in ${location}.\nHelp choose the best date 👉 ${pollUrl}`;
    }
  
    // Default fallback
    return `Vote on a date for ${eventTitle} in ${location} 👉 ${pollUrl}`;
  };
  