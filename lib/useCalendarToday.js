import { useEffect, useState } from 'react';
import { addDays, startOfDay } from 'date-fns';

// Refresh open calendars at local midnight and after a sleeping tab resumes.
export default function useCalendarToday() {
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date();
      const next = startOfDay(now);
      setToday(current => current.getTime() === next.getTime() ? current : next);
      timer = setTimeout(refresh, addDays(next, 1).getTime() - now.getTime() + 50);
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return today;
}
