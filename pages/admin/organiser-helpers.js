import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { isAdminEmail } from '@/lib/adminUsers';
import { TYPES } from '@/lib/organiserHelpers/policy.cjs';

const descriptions = {
  share: 'After 24 hours without sharing or guest responses. Up to two nudges in the first week.',
  votes: 'After two days with no guest responses to a shared event. Up to two nudges in the first week.',
  closing: 'One reminder in the last 24 hours of voting when fewer than three guests have responded.',
  finalise: 'After voting closes with responses, or after three days with three responses and no deadline. Up to two nudges while dates remain available.',
  review: 'One request 2–14 days after a confirmed event. Stops once the organiser has reviewed. Trips need a confirmed end date.',
};
const formatTime = value => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }) : 'Not yet';
export default function OrganiserHelpers() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => onAuthStateChanged(auth, current => { setUser(current && isAdminEmail(current.email) ? current : null); setAuthReady(true); }), []);
  async function request(body, cursor) {
    const token = await user.getIdToken();
    const response = await fetch(`/api/admin/organiser-helpers${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {
      method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to load organiser helpers.');
    return payload;
  }
  async function load(cursor) {
    setBusy(true); setError('');
    try {
      const payload = await request(null, cursor);
      setData(previous => cursor && previous ? { ...payload, rows: [...previous.rows, ...payload.rows] } : payload);
      if (!cursor) setForm(payload.config);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  useEffect(() => { if (user) load(); }, [user]);
  async function mutate(body) {
    setBusy(true); setError(''); setMessage('');
    try { await request(body); await load(); setMessage(body.action === 'settings' ? 'Helper settings saved.' : 'Event updated.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const schedulerHealthy = data?.runtime.lastSchedulerAt && Date.now() - data.runtime.lastSchedulerAt < 2 * 3600000;
  const editable = data?.production && !busy;
  const signIn = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch { setError('Unable to sign in. Please try again.'); } };
  return <main className="helpers">
    <Head><title>Organiser Helpers | Set The Date</title><meta name="robots" content="noindex,nofollow" /></Head>
    <Link href="/admin">← Back to admin</Link>
    <header><p className="eyebrow">SET THE DATE · ADMIN</p><h1>A little help keeping plans moving.</h1><p>Automatic organiser follow-ups, from the first share to the final review.</p></header>
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status" className="notice">{message}</p>}
    {!authReady ? <p>Checking your sign-in…</p> : !user ? <section><h2>Sign in as an admin</h2><p>View the queue, pause helpers and check delivery history.</p><button onClick={signIn}>Sign in with Google</button></section> : !data ? <p>{error ? <button disabled={busy} onClick={() => load()}>Try loading again</button> : 'Loading organiser helpers…'}</p> : <>
      <section>
        <div className="heading"><div><h2>{data.config.enabled ? 'Automatic sending is on' : data.config.activatedAt ? 'Helpers are paused' : 'Ready to set up'}</h2><p>Checks hourly. Sends between 09:00 and 19:00, London time.</p></div><span className="badge">{data.config.enabled ? 'Active' : 'Paused'}</span></div>
        <p>At least 48 hours between emails to the same organiser, across all their events. At most six attempts per event. Each email includes a link to stop reminders for that event.</p>
        <p className="muted">Last scheduler check: {formatTime(data.runtime.lastSchedulerAt)}{!schedulerHealthy && ' · Scheduler needs connecting'}</p>
        {!data.production && <p className="notice">Preview only. Change settings on the live admin site.</p>}
        {!data.configured && <p className="notice">Connect the hourly scheduler and email provider before enabling helpers.</p>}
        {data.config.enabled && <button disabled={!editable} onClick={() => mutate({ action: 'settings', ...data.config, enabled: false })}>Pause all helpers</button>}
        <form onSubmit={event => { event.preventDefault(); mutate({ action: 'settings', ...form }); }}>
          <div className="rules">{Object.entries(TYPES).map(([type, rule]) => <label key={type} className="rule"><input type="checkbox" disabled={!editable} checked={form.types[type]} onChange={event => setForm({ ...form, types: { ...form.types, [type]: event.target.checked } })} /><span><strong>{rule.label}</strong><small>{descriptions[type]}</small></span></label>)}</div>
          <div className="controls"><label>Daily email limit <input aria-label="Daily email limit" type="number" min="1" max="100" value={form.dailyLimit} disabled={!editable} onChange={event => setForm({ ...form, dailyLimit: Number(event.target.value) })} /></label>
            <label><input type="checkbox" checked={form.enabled} disabled={!editable || (!data.config.enabled && (!data.configured || !schedulerHealthy))} onChange={event => setForm({ ...form, enabled: event.target.checked })} /> Send automatically</label>
            <button disabled={!editable} type="submit">Save settings</button></div>
        </form>
        <p className="muted">Paused, cancelled, archived and test events are excluded. Review requests go to organisers only. “Accepted” means the email provider accepted the message; it does not confirm inbox delivery.</p>
      </section>
      <section><div className="heading"><div><h2>Upcoming actions</h2><p>Eligible now, subject to sending hours, cooldowns and the daily limit.</p></div><button disabled={busy} onClick={() => load()}>Refresh</button></div>
        {data.rows.length === 0 && <p>No eligible actions in the events checked so far.</p>}
        <div className="events">{data.rows.map(row => <article key={row.pollId}><div><h3>{row.title}</h3><p>{row.label}</p><small>Last attempt: {formatTime(row.lastAttemptAt)} · {row.attempts} attempts</small></div><div className="controls"><button disabled={!editable} onClick={() => mutate({ action: 'pause', pollId: row.pollId, paused: !row.paused })}>{row.paused ? 'Resume event' : 'Pause event'}</button>{row.inFlight && <button disabled={!editable} onClick={() => { if (window.confirm('Check this delivery in Brevo first. Dismissing keeps the attempt counted and does not resend it. Continue?')) mutate({ action: 'dismiss', pollId: row.pollId }); }}>Dismiss checked attempt</button>}</div></article>)}</div>
        {data.nextCursor && <button disabled={busy} onClick={() => load(data.nextCursor)}>{busy ? 'Checking…' : 'Check more events'}</button>}
      </section>
      <section id="report"><div className="heading"><div><h2>Activity report</h2><p>Last 7 days · London time</p></div><button disabled={busy} onClick={() => load()}>Refresh report</button></div>
        <div className="rules">{[['Attempts today',data.report.today],['Accepted by email provider',data.report.accepted],['Failed attempts',data.report.failed],['Uncertain delivery',data.report.uncertain],['Pending attempts',data.report.pending],['Dismissed after checking',data.report.dismissed],['Paused events',data.report.pausedEvents],['Events needing attention',data.report.heldEvents]].map(([label,value]) => <div className="rule" key={label}><span><strong>{value}</strong><small>{label}</small></span></div>)}</div>
        <p>{data.report.attempts} attempts in the last 7 days. Today’s cap: {data.config.dailyLimit} attempts.</p>
        <p>Last completed scheduler check: {formatTime(data.runtime.lastCompletedAt)}{data.runtime.lastResult?.paused ? ' · Paused' : data.runtime.lastResult?.quietHours ? ' · Outside sending hours' : data.runtime.lastResult?.remaining ? ' · More events will be checked next run' : ''}</p>
        {data.runtime.lastErrorAt && <p role="alert" className="error">Scheduler error at {formatTime(data.runtime.lastErrorAt)}. Check delivery history before retrying.</p>}
        <div className="controls">{Object.entries(TYPES).map(([type,rule]) => <span key={type}>{rule.label}: <strong>{data.report.byType[type] || 0}</strong></span>)}</div>
        <p className="muted">Accepted means Brevo accepted the email, not confirmed inbox delivery or an opened email. Paused and attention counts show the current state across all events.</p>
      </section>
      <section><h2>Recent delivery attempts</h2><p>The 30 most recent attempts. Failed or uncertain messages are never shown as sent. Uncertain deliveries hold further reminders for that event until checked.</p>
        {!data.history.length ? <p>No helper emails have been attempted yet.</p> : <div className="history">{data.history.map(item => <article key={item.id}><div><strong>{item.title}</strong><small>{TYPES[item.type]?.label} · {formatTime(item.createdAt)}</small></div><span className="badge">{item.status}</span></article>)}</div>}
      </section>
    </>}
    <style jsx>{`
      .helpers{max-width:1120px;margin:0 auto;padding:32px 20px 70px;color:#183c31;font-family:Arial,sans-serif;background:#fcfaf3;min-height:100vh}.helpers header{padding:32px 0}.eyebrow{font-size:12px;letter-spacing:2px;font-weight:bold}h1{font-size:clamp(30px,5vw,48px);line-height:1.1;max-width:750px;margin:12px 0 20px}h2{font-size:24px;margin:0 0 10px}h3{font-size:17px;margin:0}p{line-height:1.6}section{background:white;border:1px solid #dce5db;border-radius:18px;padding:26px;margin:0 0 24px}.heading,.controls{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.badge{padding:7px 12px;border-radius:20px;background:#eaf3e8;font-size:13px;font-weight:bold}button{background:#155e45;color:white;padding:11px 16px;border:0;border-radius:8px;cursor:pointer;font-weight:bold}button:disabled{opacity:.5;cursor:default}.rules{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:24px 0}.rule{display:flex;gap:12px;align-items:flex-start;background:#f6f8f3;border:1px solid #dce5db;border-radius:12px;padding:18px}input[type=checkbox]{width:18px;height:18px;flex-shrink:0;accent-color:#155e45}input[type=number]{width:75px;padding:8px;border:1px solid #aebcae;border-radius:6px}small{display:block;line-height:1.5;margin-top:7px;color:#536758}.muted{font-size:13px;color:#536758}.notice{background:#fff5ca;padding:14px;border-radius:8px}.error{background:#ffe7e4;padding:14px;border-radius:8px;color:#8c2720}article{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 0;border-top:1px solid #e3e9e1}.events p{margin:8px 0}.history article{align-items:flex-start}@media(max-width:640px){.helpers{padding:20px 14px}section{padding:20px 16px}.rules{grid-template-columns:1fr}article{align-items:flex-start;flex-direction:column}.controls{justify-content:flex-start}header{padding:24px 0}}
    `}</style>
  </main>;
}
