import { useRouter } from 'next/router';
import { useState } from 'react';
import { format, parseISO } from 'date-fns';

export default function FinalisePollActions({ poll, pollId, suggestedDate }) {
  const router = useRouter();
  const [manualMode, setManualMode] = useState(false);
  const [manualDate, setManualDate] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const effectivePollId = pollId || poll?.id || '';

  const dateToLock = manualMode && manualDate ? manualDate : suggestedDate;
  const buttonLabel = manualMode && manualDate
    ? '🚨 Lock Chosen Date and Send Message'
    : '✅ Lock Suggested Date and Send Message';

  const handleFinalise = async (finalDate = dateToLock) => {
    if (!effectivePollId || !finalDate) {
      alert('Missing poll information to finalise.');
      return;
    }

    const res = await fetch('/api/finalisePollDate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pollId: effectivePollId,
        finalDate,
        organiserEmail: poll.organiserEmail,
        organiserName: poll.organiserFirstName,
        eventTitle: poll.eventTitle,
        location: poll.location,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      router.reload();
    } else {
      alert(data.message || 'Failed to lock in date.');
    }
  };

  const handleLockAndMessage = async () => {
    if (!message.trim()) return;
    setSending(true);

    if (!effectivePollId || !dateToLock) {
      alert('Missing poll information to finalise.');
      return;
    }

    const res = await fetch('/api/finalisePollDate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pollId: effectivePollId,
        finalDate: dateToLock,
        organiserEmail: poll.organiserEmail,
        organiserName: poll.organiserFirstName,
        eventTitle: poll.eventTitle,
        location: poll.location,
      }),
    });

    if (res.ok) {
      const messageRes = await fetch('/api/sendAttendeeMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pollId: effectivePollId,
          message,
          organiserName: poll.organiserFirstName,
          eventTitle: poll.eventTitle,
        }),
      });

      setSending(false);
      if (messageRes.ok) {
        alert('Final date locked and message sent.');
        router.reload();
      } else {
        alert('Date was locked but message failed to send.');
      }
    } else {
      setSending(false);
      alert('Failed to lock in date.');
    }
  };

  return (
    <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 p-4 mb-6 rounded text-center">
      <p className="font-bold mb-2">⏳ Voting has closed for this event.</p>
      <p className="mb-4">
        Most popular date:{' '}
        <strong>{format(parseISO(suggestedDate), 'EEEE do MMMM yyyy')}</strong>
      </p>

      <button
        onClick={() => handleFinalise(suggestedDate)}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full mb-4"
      >
        ✅ Lock in Suggested Date
      </button>

      <div className="text-sm mb-2">
        <button
          onClick={() => setManualMode(!manualMode)}
          className="text-blue-700 underline"
        >
          {manualMode ? 'Cancel Manual Date Selection' : 'Choose a different date'}
        </button>
      </div>

      {manualMode && (
        <div className="mb-4">
          <select
            className="border p-2 rounded w-full mb-2"
            value={manualDate}
            onChange={(e) => setManualDate(e.target.value)}
          >
            <option value="">-- Select a date --</option>
            {poll.dates.map((d) => (
              <option key={d} value={d}>
                {format(parseISO(d), 'EEEE do MMMM yyyy')}
              </option>
            ))}
          </select>

          <button
            onClick={() => handleFinalise(manualDate)}
            disabled={!manualDate}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 w-full"
          >
            🚨 Override and Lock This Date
          </button>
        </div>
      )}

      <button
        onClick={() => router.push(`/edit/${poll.id}?token=${poll.editToken}`)}
        className="bg-white text-blue-600 border border-blue-600 px-4 py-2 rounded hover:bg-blue-50 w-full mb-6"
      >
        🔁 Extend Deadline
      </button>

      <div className="text-left">
        <label className="block font-semibold mb-1">📣 Send a message to all attendees and lock in the date:</label>
        <textarea
          rows={3}
          className="w-full border rounded p-2 mb-2"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message here..."
        ></textarea>
        <button
          onClick={handleLockAndMessage}
          disabled={sending || !message.trim()}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 w-full"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
