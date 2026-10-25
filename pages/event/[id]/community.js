import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import HubShell from '@/components/HubShell';

export default function EventCommunity() {
  const { query: { id } } = useRouter();
  const [feed, setFeed] = useState(null);
  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [website, setWebsite] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  const request = useCallback(async (method = 'GET', body) => {
    const token = user ? await user.getIdToken() : null;
    const response = await fetch(`/api/community/${encodeURIComponent(id)}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Please try again.');
    return data;
  }, [id, user]);
  const refresh = useCallback(async () => {
    if (typeof id !== 'string') return;
    const data = await request();
    setFeed(data); setAnnouncement(data.announcement); setClosed(data.closed);
  }, [id, request]);
  useEffect(() => { let active = true; if (typeof id !== 'string') return;
    request().then(data => { if (active) { setFeed(data); setAnnouncement(data.announcement); setClosed(data.closed); } })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id, request]);
  const act = async (action) => {
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err.message || 'Please try again.'); }
    finally { setBusy(false); }
  };
  const post = event => {
    event.preventDefault();
    act(async () => { await request('POST', { name, text, website }); setText(''); await refresh(); });
  };
  return <HubShell><Head><title>Event conversation | Set The Date</title><meta name="robots" content="noindex,nofollow" /></Head>
    <main className="std-community">
      <div className="std-page-heading"><span className="std-eyebrow">THE GROUP, TOGETHER</span><h1>{feed?.title || 'Your event conversation'}</h1><p>Sort the little details. Keep the good plans going.</p>
        <div className="std-action-row">{feed && <Link href={feed.eventPath}>← Back to the event</Link>}<button disabled={busy} onClick={() => act(refresh)}>Refresh conversation ↻</button></div>
      </div>
      <div className="std-notice">Anyone with this event link can read and post here. Names are self-entered, not verified. Keep private details and edit links out of messages.</div>
      {error && <p role="alert" className="std-error">{error}</p>}
      {!feed && !error && <p role="status">Opening your conversation…</p>}
      {feed && <>
        {feed.announcement && <aside className="std-announcement"><span className="std-eyebrow">PINNED BY YOUR ORGANISER</span><p>{feed.announcement}</p></aside>}
        <section className="std-conversation-card" aria-labelledby="conversation-title"><div className="std-action-row"><h2 id="conversation-title">The conversation <span>({feed.messages.length})</span></h2><span className="std-status">{feed.closed ? 'Discussion closed' : 'Open for ideas'}</span></div>
          <p className="std-muted">The latest 50 messages. Refresh to see new replies.</p>
          {!feed.messages.length && <div className="std-empty"><span aria-hidden="true">✳</span><h3>Every good plan starts with a hello.</h3><p>Ask a question, suggest a meeting spot, or say what you’re bringing.</p></div>}
          <ol className="std-messages">{feed.messages.map(message => <li key={message.id}><div className="std-avatar" aria-hidden="true">{message.name.slice(0,1).toUpperCase()}</div><div className="std-message-body"><strong>{message.name}</strong><time dateTime={message.createdAt || undefined}>{message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Just now'}</time><p>{message.text}</p></div>{feed.moderator && <button className="std-text-button" disabled={busy} onClick={() => { if (window.confirm('Remove this message from the conversation?')) act(async () => { await request('DELETE', { messageId: message.id }); await refresh(); }); }}>Remove</button>}</li>)}</ol>
          {feed.closed ? <p className="std-notice">Your organiser has closed this discussion. You can still read the conversation.</p> : <form onSubmit={post} className="std-compose"><h3>Add to the conversation</h3><label>Your name<input required maxLength={60} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label><label>Your message<textarea required maxLength={1500} rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="Anyone up for meeting a little earlier?" /></label><label hidden aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label><div className="std-action-row"><span className="std-muted">No account needed. No notification emails.</span><button className="std-primary" disabled={busy} type="submit">{busy ? 'Posting…' : 'Post message ↗'}</button></div></form>}
        </section>
        <section className="std-moderation"><h2>Organiser corner</h2>{feed.moderator ? <form onSubmit={e => { e.preventDefault(); act(async () => { await request('PATCH', { announcement, closed }); await refresh(); }); }}><label>Pinned update<textarea maxLength={1000} rows={3} value={announcement} onChange={e => setAnnouncement(e.target.value)} /></label><label className="std-check"><input type="checkbox" checked={closed} onChange={e => setClosed(e.target.checked)} /> Close discussion to new messages</label><button className="std-primary" disabled={busy}>Save discussion settings</button></form> : <><p>Pin an update, remove messages, or close the conversation. Sign in with the verified Google email used to organise this event, or your authorised admin account.</p><button disabled={busy} onClick={() => act(() => signInWithPopup(auth, new GoogleAuthProvider()))}>Sign in to manage</button>{user && <p className="std-muted">Signed in as {user.email}. This account does not have moderation access to this event.</p>}</>}</section>
      </>}
    </main>
  </HubShell>;
}
