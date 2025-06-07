// /pages/admin/archived.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, getDocs, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useTable, useSortBy, usePagination, useGlobalFilter } from 'react-table';
import { useMemo } from 'react';

const ADMIN_EMAIL = 'setthedateapp@gmail.com';

export default function ArchivedPolls() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);

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
      fetchArchivedPolls();
    }
  }, [user]);

const fetchArchivedPolls = async () => {
  const querySnapshot = await getDocs(collection(db, 'polls'));
  const pollsData = await Promise.all(
    querySnapshot.docs.map(async (docSnap) => {
      const poll = { id: docSnap.id, ...docSnap.data() };
      // Same formatting logic here...
      return poll;
    })
  );

  // ✅ Filter only archived polls
  setPolls(pollsData.filter((poll) => poll.archived));
};


  const restorePoll = async (pollId) => {
    await updateDoc(doc(db, 'polls', pollId), { archived: false });
    fetchArchivedPolls();
  };

  const deletePoll = async (pollId) => {
    await deleteDoc(doc(db, 'polls', pollId));
    fetchArchivedPolls();
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const columns = useMemo(() => [
    { Header: 'Poll ID', accessor: 'id' },
    { Header: 'Event Title', accessor: 'eventTitle' },
    { Header: 'Organizer Name', accessor: 'organizerName' },
    { Header: 'Organizer Email', accessor: 'organiserEmail' },
    { Header: 'Created At', accessor: 'createdAtFormatted' },
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
  ], []);

  const data = polls;

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
    { columns, data, initialState: { pageIndex: 0, pageSize: 25 } },
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
          Page{' '}
          <strong>
            {pageIndex + 1} of {pageOptions.length}
          </strong>{' '}
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
