import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useTable, useSortBy, usePagination, useGlobalFilter } from 'react-table';
import { format } from 'date-fns';

const ADMIN_EMAIL = 'setthedateapp@gmail.com';
const TEST_EMAILS = [
  'gavinfern@hotmail.com',
  'hello@setthedate.app',
  'test@gmail.com',
  'setthedateapp@gmail.com',
  'booking@chateaumontfelix.com',
  'nicheescapes@gmail.com'
];

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterUnshared, setFilterUnshared] = useState(false);
  const [filterLive, setFilterLive] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email === ADMIN_EMAIL) setUser(user);
      else setUser(null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) fetchPolls();
  }, [user]);

  const fetchPolls = async () => {
    const querySnapshot = await getDocs(collection(db, 'polls'));
    const pollsData = await Promise.all(querySnapshot.docs.map(async (docSnap) => {
      const poll = { id: docSnap.id, ...docSnap.data() };
      poll.organizerName = `${poll.organiserFirstName || ''} ${poll.organiserLastName || ''}`.trim() || '—';
      poll.location = poll.location || '—';
      // For createdAt sort: store as a Date object if possible.
      poll.createdAtObj = poll.createdAt?.seconds
        ? new Date(poll.createdAt.seconds * 1000)
        : poll.createdAt
        ? new Date(poll.createdAt)
        : null;

      const votesSnapshot = await getDocs(collection(db, `polls/${docSnap.id}/votes`));
      poll.totalVotes = votesSnapshot.size;

      let yesCount = 0, maybeCount = 0, noCount = 0;
      votesSnapshot.forEach((voteDoc) => {
        const voteData = voteDoc.data();
        if (voteData.votes) {
          Object.values(voteData.votes).forEach((response) => {
            if (response.toLowerCase() === 'yes') yesCount++;
            else if (response.toLowerCase() === 'maybe') maybeCount++;
            else if (response.toLowerCase() === 'no') noCount++;
          });
        }
      });
      poll.yesVotes = yesCount;
      poll.maybeVotes = maybeCount;
      poll.noVotes = noCount;
      return poll;
    }));

    setPolls(pollsData.filter(p => !p.archived && !TEST_EMAILS.includes(p.organiserEmail?.toLowerCase())));
  };

  const archivePoll = async (pollId) => {
    await updateDoc(doc(db, 'polls', pollId), { archived: true });
    fetchPolls();
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const getStatus = (deadline) => {
    if (!deadline?.seconds) return 'Unknown';
    return new Date(deadline.seconds * 1000) > new Date() ? 'Live' : 'Passed';
  };

  // Table columns
  const columns = useMemo(() => [
    { Header: 'Event #', id: 'eventNumber', Cell: ({ row }) => row.index + 1 },
    { Header: 'Poll ID', accessor: 'id' },
    {
      Header: 'Event Title', accessor: 'eventTitle',
      Cell: ({ row }) => <a className="text-blue-500 underline block truncate max-w-[200px]" href={`/results/${row.original.id}`} target="_blank" rel="noopener noreferrer">{row.original.eventTitle || '—'}</a>
    },
    { Header: 'Organizer Name', accessor: 'organizerName' },
    { Header: 'Organizer Email', accessor: 'organiserEmail' },
    { Header: 'Location', accessor: 'location' },
    {
      Header: 'Planned Event Date',
      id: 'plannedEventDate',
      accessor: row => {
        if (Array.isArray(row.dates) && row.dates.length > 0) {
          const dates = row.dates
            .map(d => new Date(d))
            .filter(d => !isNaN(d))
            .sort((a, b) => a - b);
          if (dates.length > 0) return dates[0]; // Return Date object for true sorting
        }
        return null;
      },
      Cell: ({ value }) =>
        value && !isNaN(value)
          ? format(value, 'EEE do MMM yyyy')
          : 'No dates selected',
      sortType: 'datetime'
    },
    {
      Header: 'Created At',
      id: 'createdAt',
      accessor: row =>
        row.createdAt?.seconds
          ? new Date(row.createdAt.seconds * 1000)
          : row.createdAt
          ? new Date(row.createdAt)
          : null,
      Cell: ({ value }) =>
        value && !isNaN(value)
          ? format(value, 'EEE dd MMM yyyy, HH:mm')
          : '—',
      sortType: 'datetime'
    },
    {
      Header: 'Deadline',
      accessor: row => row.deadline?.seconds ? format(new Date(row.deadline.seconds * 1000), 'EEE dd MMM yyyy, HH:mm') : '—'
    },
    {
      Header: 'Status',
      id: 'status',
      accessor: row => getStatus(row.deadline),
      Cell: ({ value }) => (
        <span className={value === 'Live' ? 'text-green-600' : value === 'Passed' ? 'text-red-500' : ''}>
          {value}
        </span>
      ),
    },
    { Header: 'Total Voters', accessor: 'totalVotes' },
    { Header: 'Yes Votes', accessor: 'yesVotes' },
    { Header: 'Maybe Votes', accessor: 'maybeVotes' },
    { Header: 'No Votes', accessor: 'noVotes' },
    {
      Header: 'Actions',
      id: 'actions',
      Cell: ({ row }) => <button onClick={() => archivePoll(row.original.id)} className="text-red-500 hover:text-red-700">🗑️ Archive</button>
    }
  ], [polls]);

  // Table setup, default sort is Planned Event Date ascending
  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    prepareRow,
    page,
    canPreviousPage,
    canNextPage,
    pageOptions,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    state: { pageIndex, pageSize, globalFilter },
    setGlobalFilter,
  } = useTable(
    {
      columns,
      data: polls,
      initialState: {
        pageIndex: 0,
        pageSize: 25,
        sortBy: [{ id: 'plannedEventDate', desc: false }]
      }
    },
    useGlobalFilter,
    useSortBy,
    usePagination
  );

  const filteredPolls = useMemo(() => {
    const now = new Date();
    return polls.filter(p => {
      const deadline = p.deadline?.seconds ? new Date(p.deadline.seconds * 1000) : null;
      const isLive = deadline ? deadline > now : false;
      return (
        (!filterUnshared || (p.totalVotes === 0 && (now - new Date(p.createdAt?.seconds * 1000 || 0)) / 86400000 >= 2)) &&
        (!filterLive || isLive)
      );
    });
  }, [polls, filterUnshared, filterLive]);

  const topPoll = [...filteredPolls].sort((a, b) => b.yesVotes - a.yesVotes)[0];

  const exportCSV = () => {
    const rows = [
      ['Poll ID', 'Title', 'Organiser', 'Location', 'Planned Date', 'Yes', 'Maybe', 'No']
    ];
    polls.forEach(p => {
      let plannedDate = '';
      if (Array.isArray(p.dates) && p.dates.length > 0) {
        const dates = p.dates
          .map(d => new Date(d))
          .filter(d => !isNaN(d))
          .sort((a, b) => a - b);
        if (dates.length > 0) plannedDate = format(dates[0], 'EEE do MMM yyyy');
      }
      rows.push([p.id, p.eventTitle, p.organizerName, p.location, plannedDate, p.yesVotes, p.maybeVotes, p.noVotes]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'set-the-date-polls.csv';
    link.click();
  };

  // Summary totals
  const yesTotal = polls.reduce((sum, p) => sum + (p.yesVotes || 0), 0);
  const maybeTotal = polls.reduce((sum, p) => sum + (p.maybeVotes || 0), 0);
  const noTotal = polls.reduce((sum, p) => sum + (p.noVotes || 0), 0);
  const grandTotal = yesTotal + maybeTotal + noTotal;

  if (loading) return <p>Loading...</p>;
  if (!user) return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-2xl font-bold">Admin Login</h1>
      <button onClick={login} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Login with Google</button>
    </div>
  );

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>

      <div className="flex gap-4 mb-4">
        <button onClick={() => setFilterUnshared(!filterUnshared)} className="bg-gray-200 px-4 py-2 rounded">{filterUnshared ? 'Show All Events' : 'Show Unshared Events'}</button>
        <button onClick={() => setFilterLive(!filterLive)} className="bg-gray-200 px-4 py-2 rounded">{filterLive ? 'Show All' : 'Show Only Live'}</button>
        <button onClick={exportCSV} className="bg-green-500 text-white px-4 py-2 rounded">⬇️ Export to CSV</button>
        <button onClick={() => router.push('/admin/archived')} className="bg-blue-600 text-white px-4 py-2 rounded">View Archived</button>
      </div>

      <input value={globalFilter || ''} onChange={(e) => setGlobalFilter(e.target.value)} placeholder="Search by Organizer or Event Title" className="mb-4 p-2 border rounded w-full" />

      <div className="mb-6 bg-gray-100 p-4 rounded-md flex flex-wrap justify-between text-sm font-medium">
        <div>Total Events: {polls.length}</div>
        <div>Total Voters: {polls.reduce((sum, p) => sum + (p.totalVotes || 0), 0)}</div>
        <div>Yes Votes: {yesTotal}</div>
        <div>Maybe Votes: {maybeTotal}</div>
        <div>No Votes: {noTotal}</div>
        <div className="font-bold">Total Votes: {grandTotal}</div>
      </div>

      {topPoll && (
        <div className="mb-6 bg-green-50 border border-green-300 p-4 rounded text-green-700">
          🏆 Top Poll: <strong>{topPoll.eventTitle}</strong> ({topPoll.yesVotes} yes votes)
        </div>
      )}

      <table {...getTableProps()} className="min-w-full bg-white">
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr {...headerGroup.getHeaderGroupProps()}>
              {headerGroup.headers.map((column) => (
                <th {...column.getHeaderProps(column.getSortByToggleProps())} className="p-4 border-b-2 font-bold bg-gray-100">
                  {column.render('Header')}
                  <span>{column.isSorted ? (column.isSortedDesc ? ' 🔽' : ' 🔼') : ''}</span>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...getTableBodyProps()}>
          {page.map((row) => {
            prepareRow(row);
            return (
              <tr {...row.getRowProps()} className="hover:bg-gray-50">
                {row.cells.map((cell) => <td {...cell.getCellProps()} className="p-4 border-b">{cell.render('Cell')}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex justify-between mt-4">
        <div>
          <button onClick={() => gotoPage(0)} disabled={!canPreviousPage} className="mr-2">{'<<'}</button>
          <button onClick={() => previousPage()} disabled={!canPreviousPage} className="mr-2">{'<'}</button>
          <button onClick={() => nextPage()} disabled={!canNextPage} className="mr-2">{'>'}</button>
          <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>{'>>'}</button>
        </div>
        <span>
          Page <strong>{pageIndex + 1} of {pageOptions.length}</strong>
        </span>
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          {[25, 50, 100].map((size) => <option key={size} value={size}>Show {size}</option>)}
        </select>
      </div>
    </div>
  );
}
