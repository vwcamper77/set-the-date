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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email === ADMIN_EMAIL) {
        setUser(user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchPolls();
    }
  }, [user]);

  const fetchPolls = async () => {
    const querySnapshot = await getDocs(collection(db, 'polls'));
    const pollsData = await Promise.all(
      querySnapshot.docs.map(async (docSnap) => {
        const poll = { id: docSnap.id, ...docSnap.data() };
        poll.organizerName = `${poll.organiserFirstName || ''} ${poll.organiserLastName || ''}`.trim() || '—';
        poll.location = poll.location || '—';
        poll.selectedDates = Array.isArray(poll.selectedDates)
          ? poll.selectedDates.map(d => (typeof d?.toDate === 'function' ? d.toDate().toISOString() : d))
          : [];

        const sortedDates = poll.selectedDates.slice().sort((a, b) => new Date(a) - new Date(b));
        poll.firstEventDate = sortedDates.length > 0 ? new Date(sortedDates[0]) : null;

        const votesSnapshot = await getDocs(collection(db, `polls/${docSnap.id}/votes`));
        poll.totalVotes = votesSnapshot.size;

        let yesCount = 0;
        let maybeCount = 0;
        let noCount = 0;

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
      })
    );

    setPolls(pollsData.filter(
      (poll) => !poll.archived && !TEST_EMAILS.includes(poll.organiserEmail?.toLowerCase())
    ));
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

  const filteredPolls = useMemo(() => {
    const now = new Date();
    return filterUnshared
      ? polls.filter(p => p.totalVotes === 0 && (now - new Date(p.createdAt?.seconds * 1000 || 0)) / (1000 * 60 * 60 * 24) >= 2)
      : polls;
  }, [polls, filterUnshared]);

  const sortedPolls = useMemo(() => {
    return [...filteredPolls].sort((a, b) => new Date(a.createdAt?.seconds * 1000 || 0) - new Date(b.createdAt?.seconds * 1000 || 0));
  }, [filteredPolls]);

  const columns = useMemo(() => [
    {
      Header: 'Event #',
      id: 'eventNumber',
      Cell: ({ row }) => sortedPolls.findIndex(p => p.id === row.original.id) + 1
    },
    { Header: 'Poll ID', accessor: 'id' },
    {
      Header: 'Event Title', accessor: 'eventTitle',
      Cell: ({ row }) => (
        <a
          className="text-blue-500 underline block truncate max-w-[200px]"
          href={`/results/${row.original.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {row.original.eventTitle || '—'}
        </a>
      )
    },
    { Header: 'Organizer Name', accessor: 'organizerName' },
    { Header: 'Organizer Email', accessor: 'organiserEmail' },
    { Header: 'Location', accessor: 'location' },
    {
      Header: 'Days Until First Event', accessor: 'firstEventDate',
      Cell: ({ value }) => {
        if (!value) return 'No dates selected';
        const diff = Math.floor((value - new Date()) / (1000 * 60 * 60 * 24));
        return diff < 0 ? `Event already passed (${Math.abs(diff)} days ago)` : `${diff} days`;
      }
    },
    {
      Header: 'Created At', accessor: 'createdAt',
      Cell: ({ value }) => value?.seconds ? format(new Date(value.seconds * 1000), 'EEE dd MMM yyyy, HH:mm') : '—'
    },
    {
      Header: 'Deadline', accessor: 'deadline',
      Cell: ({ value }) => value?.seconds ? format(new Date(value.seconds * 1000), 'EEE dd MMM yyyy, HH:mm') : '—'
    },
    {
      Header: 'Status', id: 'status',
      Cell: ({ row }) => {
        const status = getStatus(row.original.deadline);
        const color = status === 'Live' ? 'green' : 'red';
        return <span style={{ color }}>{status}</span>;
      }
    },
    { Header: 'Total Voters', accessor: 'totalVotes' },
    { Header: 'Yes Votes', accessor: 'yesVotes' },
    { Header: 'Maybe Votes', accessor: 'maybeVotes' },
    { Header: 'No Votes', accessor: 'noVotes' },
    {
      Header: 'Actions', id: 'actions',
      Cell: ({ row }) => (
        <button
          onClick={() => archivePoll(row.original.id)}
          className="text-red-500 hover:text-red-700"
        >
          🗑️ Archive
        </button>
      )
    }
  ], [sortedPolls]);

  const data = sortedPolls;

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
    { columns, data, initialState: { pageIndex: 0, pageSize: 25, sortBy: [{ id: 'createdAt', desc: true }] } },
    useGlobalFilter,
    useSortBy,
    usePagination
  );

  if (loading) return <p>Loading...</p>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold">Admin Login</h1>
        <button
          onClick={login}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Login with Google
        </button>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      <div className="flex justify-between mb-4">
        <button
          onClick={() => setFilterUnshared(!filterUnshared)}
          className="bg-gray-300 px-4 py-2 rounded mr-4"
        >
          {filterUnshared ? 'Show All Events' : 'Show Unshared Events'}
        </button>
        <button
          onClick={() => router.push('/admin/archived')}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          View Archived Polls
        </button>
      </div>
      <input
        value={globalFilter || ''}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder="Search by Organizer or Event Title"
        className="mb-4 p-2 border rounded w-full"
      />
      <table {...getTableProps()} className="min-w-full bg-white">
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr {...headerGroup.getHeaderGroupProps()}>
              {headerGroup.headers.map((column) => (
                <th
                  {...column.getHeaderProps(column.getSortByToggleProps())}
                  className="p-4 border-b-2 font-bold bg-gray-100"
                >
                  {column.render('Header')}
                  <span>
                    {column.isSorted ? (column.isSortedDesc ? ' 🔽' : ' 🔼') : ''}
                  </span>
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
                {row.cells.map((cell) => (
                  <td {...cell.getCellProps()} className="p-4 border-b">
                    {cell.render('Cell')}
                  </td>
                ))}
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
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {[25, 50, 100].map((size) => (
            <option key={size} value={size}>
              Show {size}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
