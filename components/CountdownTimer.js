import { useEffect, useMemo, useState } from 'react';

const normaliseDeadline = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value?.toDate === 'function') {
    try {
      const converted = value.toDate();
      return Number.isNaN(converted?.getTime()) ? null : converted;
    } catch {
      return null;
    }
  }
  const candidate = new Date(value);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

export default function CountdownTimer({ deadline, className = 'my-4' }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  const resolvedDeadline = useMemo(() => normaliseDeadline(deadline), [deadline]);

  useEffect(() => {
    if (!resolvedDeadline) {
      setTimeLeft('');
      setIsExpired(false);
      return undefined;
    }

    const target = resolvedDeadline;

    const updateCountdown = () => {
      const now = new Date();
      const diff = target - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft('Voting has closed');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s left to vote`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [resolvedDeadline]);

  if (!resolvedDeadline) return null;

  const containerClasses = [
    'flex items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm',
    isExpired ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-rose-200 bg-rose-50 text-rose-700',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses}>
      <span role="img" aria-label="Hourglass" className="text-base">
        ⏳
      </span>
      <span>{timeLeft || 'Voting deadline pending'}</span>
    </div>
  );
}
