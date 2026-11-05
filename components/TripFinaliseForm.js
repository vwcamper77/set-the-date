import { useState } from 'react';
import { format } from 'date-fns';
import { getTripAvailability, getTripAvailabilityMessage } from '@/lib/tripDates.mjs';

export default function TripFinaliseForm({ poll, pollId, editToken, onFinalised }) {
  const available = getTripAvailability(poll);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (poll.finalDate || !available) return <p role="status" className="my-4 rounded border p-4">{getTripAvailabilityMessage(poll)}</p>;
  const confirmDates = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/finaliseTrip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pollId, editToken, start, end }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not confirm dates.');
      onFinalised?.(data);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const min = format(available.start, 'yyyy-MM-dd');
  const max = format(available.end, 'yyyy-MM-dd');
  return <form onSubmit={confirmDates} className="my-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
    <h2 className="font-semibold">Confirm trip dates</h2>
    <p className="my-2 text-sm">Choose the agreed start and finish. Confirming closes collection of new travel windows.</p>
    <label className="block text-sm">Trip start<input aria-label="Trip start" type="date" required min={min} max={max} value={start} onChange={e => setStart(e.target.value)} className="my-1 block w-full rounded border p-2" /></label>
    <label className="block text-sm">Trip finish<input aria-label="Trip finish" type="date" required min={start || min} max={max} value={end} onChange={e => setEnd(e.target.value)} className="my-1 block w-full rounded border p-2" /></label>
    <button type="submit" disabled={saving || !start || !end || end < start} className="mt-2 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{saving ? 'Confirming…' : 'Confirm trip dates'}</button>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </form>;
}
