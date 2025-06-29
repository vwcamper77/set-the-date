import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useTable, useSortBy, usePagination, useGlobalFilter } from 'react-table';
import { format } from 'date-fns';

const ADMIN_EMAIL = 'setthedateapp@gmail.com';

export default function ArchivedPolls() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email === ADMIN_EMAIL) setUser(user);
      else setUser(null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) fetchArchivedPolls();
  }, [user]);

  const fetchArchivedPolls = async () => {
    const querySnapshot = await getDocs(collection(db, 'polls'));
    const pollsData = await Promise.all(querySnapshot.docs.map(async (docSnap) => {
      const poll = { id: docSnap.id, ...docSnap.data() };
      poll.organizerName = `${poll.organiserFirstName || ''} ${poll.organiserLastName || ''}`.trim() || '—';
      poll.location = poll.location || '—';
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

    setPolls(pollsData.filter(poll => poll.archived));
  };

  const restorePoll = async (pollId) => {
    await updateDoc(doc(db, 'polls', pollId), { archived: false });
    fetchArchivedPolls();
  };

  const deletePoll = async (pollId) => {
    if (window.confirm("Delete this poll forever? This cannot be undone!")) {
      await deleteDoc(doc(db, 'polls', pollId));
      fetchArchivedPolls();
    }
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const getStatus = (deadline) => {
    if (!deadline?.seconds) return 'Unknown';
    return new Date(deadline.seconds * 1000) > new Date() ? 'Live' : 'Passed';
  };

  const columns = useMemo(() => [
    { Header: 'Event #', id: 'eventNumber', Cell: ({ row }) => row.index + 1 },
    { Header: 'Poll ID', accessor: 'id' },
    { Header: 'Event Title', accessor: 'eventTitle' },
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
          if (dates.length > 0) return dates[0];
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
      id: 'deadline',
      accessor: row =>
        row.deadline?.seconds
          ? new Date(row.deadline.seconds * 1000)
          : row.deadline
          ? new Date(row.deadline)
          : null,
      Cell: ({ value }) =>
        value && !isNaN(value)
          ? format(value, 'EEE dd MMM yyyy, HH:mm')
          : '—',
      sortType: 'datetime'
    },
    {
      Header: 'Status',
      id: 'status',
      accessor: row => getStatus(row.deadline),
      Cell: ({ value }) => (
        <span style={{
          color: value === 'Live' ? '#22c55e' : value === 'Passed' ? '#ef4444' : undefined,
          fontWeight: 600
        }}>
          {value}
        </span>
      ),
    },
    {
      Header: 'Finalised',
      id: 'finalised',
      accessor: row => {
        if (getStatus(row.deadline) === 'Passed') {
          if (row.finalDate) return 'finalised';
          return 'not_finalised';
        }
        return '';
      },
      Cell: ({ value }) => {
        if (value === 'finalised') {
          return <span title="Finalised" style={{ color: '#22c55e', fontSize: '2em', verticalAlign: 'middle' }}>●</span>;
        }
        if (value === 'not_finalised') {
          return <span title="Not Finalised" style={{ color: '#ef4444', fontSize: '2em', verticalAlign: 'middle' }}>●</span>;
        }
        return null;
      }
    },
    { Header: 'Total Voters', accessor: 'totalVotes' },
    { Header: 'Yes Votes', accessor: 'yesVotes' },
    { Header: 'Maybe Votes', accessor: 'maybeVotes' },
    { Header: 'No Votes', accessor: 'noVotes' },
    {
      Header: 'Actions',
      id: 'actions',
      Cell: ({ row }) => (
        <div className="space-x-2">
          <button
            onClick={() => restorePoll(row.original.id)}
            className="text-green-500 hover:text-green-700"
          >
            ♻️ Restore
          </button>
          <button
            onClick={() => deletePoll(row.original.id)}
            className="text-red-500 hover:text-red-700"
          >
            ❌ Delete
          </button>
        </div>
      )
    }
  ], [polls]);

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
        pageSize: 50,
        sortBy: [{ id: 'createdAt', desc: true }]
      }
    },
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
      <h1 className="text-3xl font-bold mb-6">Archived Polls</h1>
      <button
        onClick={() => router.push('/admin')}
        className="bg-gray-300 px-4 py-2 rounded mb-4"
      >
        Back to Dashboard
      </button>
      <div className="w-full overflow-x-auto">
        <table {...getTableProps()} className="min-w-full bg-white">
          <thead>
            {headerGroups.map((headerGroup) => (
              <tr {...headerGroup.getHeaderGroupProps()}>
                {headerGroup.headers.map((column) => (
                  <th
                    {...column.getHeaderProps(column.getSortByToggleProps())}
                    className="px-2 py-2 border-b-2 font-bold bg-gray-100 text-xs md:text-sm whitespace-nowrap"
                  >
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
                  {row.cells.map((cell) => (
                    <td
                      {...cell.getCellProps()}
                      className="px-2 py-1 border-b text-xs md:text-sm whitespace-nowrap"
                    >
                      {cell.render('Cell')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
