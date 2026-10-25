import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { isAdminEmail } from '@/lib/adminUsers';

export default function AdminSupportPage() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('');
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser && isAdminEmail(currentUser.email) ? currentUser : null);
    setAuthReady(true);
  }), []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setFeedback('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/support', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!response.ok) throw new Error('Could not load tickets');
      const data = await response.json();
      setTickets(data.tickets || []);
    } catch (error) {
      setFeedback(error.message || 'Unable to load tickets');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const selected = tickets.find((item) => item.id === selectedId) || null;
  const visible = useMemo(() => tickets.filter((item) => {
    if (filter === 'active') return item.status !== 'resolved';
    if (filter === 'all') return true;
    return item.status === filter;
  }), [tickets, filter]);

  const choose = (ticket) => {
    setSelectedId(ticket.id);
    setReply('');
    setStatus(ticket.status);
    setFeedback('');
  };

  const save = async () => {
    if (!selected || (!reply.trim() && status === selected.status)) return;
    setSaving(true);
    setFeedback('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ ticketId: selected.id, status, reply: reply.trim() }),
      });
      if (!response.ok) throw new Error('Could not update ticket');
      setReply('');
      setFeedback('Saved. Any reply was sent via Brevo.');
      await refresh();
    } catch (error) {
      setFeedback(error.message || 'Unable to update ticket');
    } finally {
      setSaving(false);
    }
  };

  const login = async () => {
    setFeedback('');
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch { setFeedback('Admin sign-in was not completed.'); }
  };

  return (
    <>
      <Head><title>Support Inbox | Set The Date Admin</title></Head>
      <main className="min-h-screen bg-slate-50 px-4 py-7 text-slate-900">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">Set The Date Admin</p>
              <h1 className="mt-2 text-3xl font-bold">Support Inbox</h1>
              <p className="mt-2 text-sm text-slate-700">Support requests submitted through the app, with a reply history.</p>
            </div>
            <div className="flex gap-3">
              <Link href="/admin" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Dashboard</Link>
              {user && <button onClick={refresh} type="button" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                {loading ? 'Loading…' : 'Refresh'}
              </button>}
            </div>
          </div>

          {!authReady && <p className="mt-8">Checking admin access…</p>}
          {authReady && !user && (
            <section className="mt-7 rounded-2xl border bg-white p-6">
              <p className="mb-4">Sign in with an authorised admin Google account.</p>
              <button className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white" onClick={login}>Admin sign in</button>
            </section>
          )}
          {user && (
            <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                  <h2 className="font-semibold">Requests ({visible.length})</h2>
                  <select value={filter} onChange={(event) => setFilter(event.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Filter tickets">
                    <option value="active">Active</option>
                    <option value="all">All</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="waiting">Waiting</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <div className="max-h-[70vh] space-y-2 overflow-y-auto">
                  {!visible.length && <p className="py-6 text-sm text-slate-600">No matching enquiries.</p>}
                  {visible.map((item) => (
                    <button key={item.id} type="button" onClick={() => choose(item)}
                      className={'w-full rounded-xl border p-4 text-left hover:border-slate-500 ' +
                        (selectedId === item.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200')}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-semibold">{item.name}</span>
                        <span className="text-xs font-medium text-slate-600">{item.status.replaceAll('_', ' ')}</span>
                      </div>
                      <div className="mt-1 truncate text-sm text-slate-600">{item.email}</div>
                      <p className="mt-2 line-clamp-2 text-sm">{item.message}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {item.category} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recently'}
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                {!selected ? <p className="text-slate-600">Select a support request to view or reply.</p> : (
                  <>
                    <h2 className="text-xl font-bold">{selected.name}</h2>
                    <p className="mt-1 break-all text-sm text-slate-700">
                      <a className="underline" href={'mailto:' + selected.email}>{selected.email}</a>
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{selected.category} · {selected.source} · {selected.id}</p>
                    {selected.eventLink && <p className="mt-3 break-all text-sm">
                      Event: <a className="text-blue-700 underline" href={selected.eventLink} target="_blank" rel="noreferrer">{selected.eventLink}</a>
                    </p>}
                    <div className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6">{selected.message}</div>
                    {selected.replies?.length > 0 && (
                      <div className="mt-5">
                        <h3 className="font-semibold">Previous replies</h3>
                        {selected.replies.map((item, index) => (
                          <div key={index} className="mt-3 rounded-lg border border-slate-200 p-3">
                            <p className="whitespace-pre-wrap text-sm">{item.text}</p>
                            <p className="mt-2 text-xs text-slate-500">{item.sentBy} · {item.sentAt}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <label className="mt-6 block text-sm font-semibold">Status
                      <select value={status} onChange={(event) => setStatus(event.target.value)}
                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3">
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="waiting">Waiting for customer</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </label>
                    <label className="mt-4 block text-sm font-semibold">Reply by email (optional)
                      <textarea rows={7} value={reply} onChange={(event) => setReply(event.target.value)}
                        placeholder="Hi…"
                        className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-base"/>
                    </label>
                    <button type="button" disabled={saving} onClick={save}
                      className="mt-4 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-60">
                      {saving ? 'Saving…' : reply.trim() ? 'Send reply & save' : 'Save status'}
                    </button>
                  </>
                )}
              </section>
            </div>
          )}
          {feedback && <p className="mt-5 text-sm text-slate-800" role="status">{feedback}</p>}
        </div>
      </main>
    </>
  );
}
