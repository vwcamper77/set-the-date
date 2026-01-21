import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import RentalsNav from '@/components/RentalsNav';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export default function RentalsContactPage() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [propertyCount, setPropertyCount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.email) {
        setEmail((prev) => prev || user.email);
      }
    });
    return () => unsubscribe();
  }, []);

  const isValidEmail = useMemo(() => VALID_EMAIL_REGEX.test(email), [email]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess(false);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedMessage = message.trim();
    const parsedCount = Number.parseInt(propertyCount, 10);

    if (!trimmedEmail || !isValidEmail) {
      setError('Enter a valid email address.');
      return;
    }

    if (!Number.isFinite(parsedCount) || parsedCount <= 0) {
      setError('Enter how many properties you manage.');
      return;
    }

    if (!trimmedMessage) {
      setError('Tell us a bit about your portfolio.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/rentals/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          phone: phone.trim(),
          propertyCount: parsedCount,
          message: trimmedMessage,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to submit your request.');
      }

      setSuccess(true);
      setMessage('');
      setPropertyCount('');
    } catch (submitError) {
      setError(submitError?.message || 'Unable to submit your request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Custom rentals plan - Set The Date</title>
        <meta
          name="description"
          content="Request a custom rentals plan for portfolios with 20 or more properties."
        />
      </Head>

      <RentalsNav />

      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-16">
        <div className="max-w-2xl mx-auto rounded-[32px] bg-white text-slate-900 shadow-2xl shadow-slate-900/30 p-10">
          <div className="text-center mb-8">
            <p className="uppercase tracking-[0.35em] text-xs text-slate-500 mb-3">Custom plan</p>
            <h1 className="text-3xl font-semibold">Talk to us about your rentals portfolio</h1>
            <p className="mt-3 text-sm text-slate-600">
              Share the details below and we will reach out with a custom plan and onboarding support.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="contactEmail" className="text-sm font-medium text-slate-600 block mb-1">
                Email
              </label>
              <input
                id="contactEmail"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                placeholder="you@yourcompany.com"
                required
              />
            </div>

            <div>
              <label htmlFor="contactPhone" className="text-sm font-medium text-slate-600 block mb-1">
                Phone number (optional)
              </label>
              <input
                id="contactPhone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                placeholder="+44 20 1234 5678"
              />
            </div>

            <div>
              <label htmlFor="propertyCount" className="text-sm font-medium text-slate-600 block mb-1">
                How many properties do you manage?
              </label>
              <input
                id="propertyCount"
                type="number"
                min="1"
                value={propertyCount}
                onChange={(event) => setPropertyCount(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                placeholder="e.g. 24"
                required
              />
            </div>

            <div>
              <label htmlFor="portfolioMessage" className="text-sm font-medium text-slate-600 block mb-1">
                Tell us about your portfolio
              </label>
              <textarea
                id="portfolioMessage"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition"
                placeholder="Locations, timeline, or anything else we should know."
                required
              />
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}
            {success && (
              <p className="text-sm text-emerald-600">Thanks! We will reach out shortly.</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-slate-900 text-white font-semibold py-3 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Sending request...' : 'Send request'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
