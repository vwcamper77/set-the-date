// pages/admin.js
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { useRouter } from 'next/router';
import { collection, getDocs } from 'firebase/firestore';
import Head from 'next/head';

export default function AdminPage() {
  const router = useRouter();
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('current');

  const now = new Date();
  const today = new Date();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchPolls = async () => {
      const pollsSnapshot = await getDocs(collection(db, 'polls'));
      const pollsData = [];

      for (const doc of pollsSnapshot.docs) {
        const poll = { id: doc.id, ...doc.data() };
        const votesSnapshot = await getDocs(collection(db, `polls/${doc.id}/votes`));
        poll.votes = votesSnapshot.docs.map(v => v.data());
        pollsData.push(poll);
      }

      setPolls(pollsData);
      setLoading(false);
    };

    fetchPolls();
  }, [user]);

  const isExpired = (createdAt) => {
    const createdDate = createdAt?.toDate?.();
    if (!createdDate) return false;
    const timeDiff = now.getTime() - createdDate.getTime();
    return timeDiff > 2 * 24 * 60 * 60 * 1000;
  };

  const formatDate = (date) =>
    new Date(date?.toDate?.()).toLocaleString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const exportCSV = () => {
    const rows = [
      ['Poll ID', 'Title', 'Organiser', 'Email', 'Location', 'Created At', 'Dates', 'Attendees'],
      ...polls.map(poll => [
        poll.id,
        poll.title,
        `${poll.firstName || ''} ${poll.lastName || ''}`.trim(),
        poll.email || '',
        poll.location || '',
        poll.createdAt?.toDate?.().toISOString() || '',
        (poll.selectedDates || []).join('; '),
        (poll.votes || []).map(v => v.name).join('; ')
      ])
    ];
    const csv = rows.map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'evening-out-polls.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderVotes = (votes) =>
    votes.map((vote, i) => (
      <div key={i} className="ml-4 mb-2 text-sm">
        <strong>{vote.name}</strong><br />
        {Object.entries(vote.response || {}).map(([date, status]) => (
          <div key={date} className="flex gap-2 items-center">
            <span>{new Date(date).toDateString()}</span>
            <span className={`px-2 py-1 rounded text-xs ${
              status === 'Best' ? 'bg-green-200 text-green-800' :
              status === 'Maybe' ? 'bg-yellow-200 text-yellow-800' :
              'bg-gray-200 text-gray-800'}
            `}>{status}</span>
          </div>
        ))}
      </div>
    ));

  const renderPoll = (poll) => (
    <div key={poll.id} className="border border-gray-300 p-4 rounded mb-4">
      <h3 className="text-lg font-bold mb-1">{poll.title || '(Untitled)'} ({poll.id})</h3>
      <p><strong>Organiser:</strong> {poll.firstName || 'N/A'} {poll.lastName || ''}</p>
      <p><strong>Email:</strong> {poll.email || 'N/A'}</p>
      <p><strong>Location:</strong> {poll.location || 'N/A'}</p>
      <p><strong>Preferred Date:</strong> {poll.preferredDate ? new Date(poll.preferredDate).toDateString() : 'N/A'}</p>
      <p><strong>Created At:</strong> {formatDate(poll.createdAt)}</p>
      <p className="mt-2 font-semibold">Dates Suggested:</p>
      <ul className="list-disc list-inside">
        {poll.selectedDates?.map((d, i) => {
          const dateObj = d?.toDate?.() || new Date(d);
          return <li key={i}>{dateObj.toDateString()}</li>;
        })}
      </ul>
      <p className="mt-2 font-semibold">Attendees:</p>
      {renderVotes(poll.votes)}
    </div>
  );

  const futurePolls = polls.filter(p =>
    (p.selectedDates || []).some(date => {
      const d = date?.toDate?.() || new Date(date);
      return d > today;
    })
  );
  const currentPolls = polls.filter(p => !isExpired(p.createdAt) && !futurePolls.includes(p));
  const pastPolls = polls.filter(p => isExpired(p.createdAt) && !futurePolls.includes(p));

  if (!user) return <p className="p-6">🔒 Checking authentication...</p>;

  return (
    <>
      <Head><title>Admin Panel - Evening Out</title></Head>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">🛠️ Admin Panel</h1>
          <div className="space-x-2">
            <button onClick={exportCSV} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Export CSV</button>
            <button onClick={() => signOut(auth).then(() => router.push('/login'))} className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">Logout</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-4 mb-6">
          {['current', 'future', 'past'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-full font-medium ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)} Events
            </button>
          ))}
        </div>

        {/* Content by Tab */}
        {loading ? (
          <p>Loading polls...</p>
        ) : (
          <div>
            {tab === 'future' && (
              <>{futurePolls.length === 0 ? <p>No future events.</p> : futurePolls.map(renderPoll)}</>
            )}
            {tab === 'current' && (
              <>{currentPolls.length === 0 ? <p>No current events.</p> : currentPolls.map(renderPoll)}</>
            )}
            {tab === 'past' && (
              <>{pastPolls.length === 0 ? <p>No past events.</p> : pastPolls.map(renderPoll)}</>
            )}
          </div>
        )}
      </div>
    </>
  );
}