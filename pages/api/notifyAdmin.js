import { useEffect } from 'react';

useEffect(() => {
  const notifyAdmin = async () => {
    if (!poll || !id) return;

    const payload = {
      organiserName: poll.organiserFirstName || "Unknown",
      eventTitle: poll.eventTitle || poll.title || "Untitled Event",
      location: poll.location || "Unspecified",
      selectedDates: poll.dates || [],
      pollId: id,
      pollLink: `https://setthedate.app/poll/${id}`
    };

    try {
      const res = await fetch('/api/notifyAdmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const error = await res.json();
        console.error("❌ Admin notify failed:", error);
      } else {
        console.log("✅ Admin notified");
      }
    } catch (err) {
      console.error("❌ Admin notify error:", err);
    }
  };

  notifyAdmin();
}, [poll, id]);
