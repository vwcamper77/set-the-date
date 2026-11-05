import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState } from 'react';
export default function StopReminders() {
  const { query, isReady } = useRouter();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function stop() {
    setBusy(true);
    try {
      const response = await fetch('/api/organiser-helpers/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pollId: query.pollId, token: query.token }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setStatus('Reminders for this event are now stopped.');
    } catch (error) { setStatus(error.message || 'Please try again.'); } finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 580, padding: '64px 24px', margin: 'auto', fontFamily: 'Arial,sans-serif', color: '#183c31' }}>
    <Head><title>Stop event reminders | Set The Date</title><meta name="robots" content="noindex,nofollow" /><meta name="referrer" content="no-referrer" /></Head>
    <p>SET THE DATE</p><h1>Stop reminders for this event</h1><p>Your event and votes will stay available. We’ll stop the automatic sharing, voting, finalising and review reminders for this event.</p>
    <button disabled={!isReady || busy || status.startsWith('Reminders for')} onClick={stop} style={{ padding: '14px 20px', background: '#155e45', color: '#fff', border: 0, borderRadius: 8 }}>{busy ? 'Saving…' : 'Stop reminders'}</button>
    {status && <p role="status">{status}</p>}
  </main>;
}
