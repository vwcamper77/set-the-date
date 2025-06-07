import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/admin');
      } else {
        setChecking(false); // ✅ Only stop checking if user is not logged in
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/admin');
    } catch (err) {
      setError(err.message);
    }
  };

  if (checking) return <p className="p-6">🔒 Checking authentication...</p>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white p-6 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-4 text-center">Admin Login</h1>
        <input
          type="email"
          placeholder="Email"
          className="w-full border p-2 mb-3 rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full border p-2 mb-3 rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
        >
          Login
        </button>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        {/* Temporary logout/reset button if you get stuck */}
        <button
          type="button"
          onClick={() => signOut(auth)}
          className="mt-4 text-blue-500 underline text-sm"
        >
          Sign Out (Reset Session)
        </button>
      </form>
    </div>
  );
}
