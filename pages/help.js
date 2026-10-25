import HubShell from '@/components/HubShell';
import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const FAQ = [
  {
    question: 'How do I edit an event I created without an account?',
    answer: 'Open the private edit link in your original organiser email. You can also check My Events on the same device you used to create the event. If you no longer have the link, use the recovery form below.',
  },
  {
    question: 'How do I cancel or delete my event?',
    answer: 'Open your private event management link and choose Cancel event. If you have lost the link, request a fresh private link using the same organiser email address.',
  },
  {
    question: 'I registered after creating an event. Where did it go?',
    answer: 'Older events do not automatically attach to a newly created Pro or venue account. You can still access them using the original email and event recovery below.',
  },
  {
    question: 'Do my guests need an account?',
    answer: 'No. Guests can vote Best, Maybe or No without registering.',
  },
  {
    question: 'Where can I find my past events?',
    answer: 'My Events lists events saved in this browser. For events created on another device, request a private management link by email.',
  },
];

export default function HelpPage() {
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [contact, setContact] = useState({ name: '', email: '', category: 'event-access', eventLink: '', message: '', website: '' });
  const [contactLoading, setContactLoading] = useState(false);
  const [contactMessage, setContactMessage] = useState('');

  const recover = async (event) => {
    event.preventDefault();
    setRecoveryLoading(true);
    setRecoveryMessage('');
    try {
      const response = await fetch('/api/recoverEvents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail }),
      });
      const data = await response.json();
      setRecoveryMessage(data.message || (response.ok ? 'Check your email.' : 'Please try again.'));
    } catch {
      setRecoveryMessage('Unable to submit your request. Please try again.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const send = async (event) => {
    event.preventDefault();
    setContactLoading(true);
    setContactMessage('');
    try {
      const response = await fetch('/api/support', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact),
      });
      const data = await response.json();
      setContactMessage(data.message || 'Unable to submit your request.');
      if (response.ok) setContact({ name: '', email: '', category: 'event-access', eventLink: '', message: '', website: '' });
    } catch {
      setContactMessage('Please try again or email hello@setthedate.app.');
    } finally {
      setContactLoading(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 focus:border-slate-700 focus:outline-none';
  const change = (key, value) => setContact((prev) => ({ ...prev, [key]: value }));

  return (
    <HubShell>
      <Head>
        <title>Help & Support | Set The Date</title>
        <meta name="description" content="Recover, edit or cancel events, and contact Set The Date support." />
      </Head>
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-slate-200 bg-white px-5 py-7 shadow-sm sm:px-8">
            <h1 className="mt-4 text-3xl font-bold">Help & Support</h1>
            <p className="mt-2 text-base text-slate-700">
              Need to change an event, retrieve your link or get help? Start here.
            </p>
            <nav className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
              <Link href="/my-events" className="rounded-full border border-slate-300 px-4 py-2 text-slate-900 hover:bg-slate-50">
                My Events
              </Link>
              <Link href="/" className="rounded-full border border-slate-300 px-4 py-2 text-slate-900 hover:bg-slate-50">
                Create an Event
              </Link>
            </nav>
          </div>

          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Find an event you created</h2>
            <p className="mt-2 text-sm text-slate-700">
              Enter the email you used as the organiser. If we can find matching events,
              we will send their private edit links directly to that address.
              You do not need an account.
            </p>
            <form onSubmit={recover} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label className="flex-1 text-sm font-semibold">
                Organiser email
                <input type="email" className={inputClass + ' mt-2'} autoComplete="email"
                  value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)}
                  placeholder="you@example.com" required />
              </label>
              <button className="self-end rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-60"
                type="submit" disabled={recoveryLoading}>
                {recoveryLoading ? 'Sending…' : 'Email my links'}
              </button>
            </form>
            {recoveryMessage && <p className="mt-3 text-sm text-slate-800" role="status">{recoveryMessage}</p>}
          </section>

          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Frequently asked questions</h2>
            <div className="mt-4 divide-y divide-slate-200">
              {FAQ.map((item) => (
                <details key={item.question} className="py-4">
                  <summary className="cursor-pointer text-base font-semibold">{item.question}</summary>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Contact support</h2>
            <p className="mt-2 text-sm text-slate-700">We will reply by email. Please do not send passwords or private edit links.</p>
            <form onSubmit={send} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">Your name
                  <input className={inputClass + ' mt-2'} maxLength={100} required
                    value={contact.name} onChange={(event) => change('name', event.target.value)} />
                </label>
                <label className="text-sm font-semibold">Email address
                  <input className={inputClass + ' mt-2'} type="email" required autoComplete="email"
                    value={contact.email} onChange={(event) => change('email', event.target.value)} />
                </label>
              </div>
              <label className="block text-sm font-semibold">What can we help with?
                <select className={inputClass + ' mt-2'} value={contact.category}
                  onChange={(event) => change('category', event.target.value)}>
                  <option value="event-access">Find or recover an event</option>
                  <option value="event-changes">Edit or delete an event</option>
                  <option value="technical">Technical problem</option>
                  <option value="billing">Billing or account</option>
                  <option value="feedback">Feedback or suggestion</option>
                  <option value="other">Something else</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">Public event link (optional)
                <input className={inputClass + ' mt-2'} type="url"
                  value={contact.eventLink} onChange={(event) => change('eventLink', event.target.value)}
                  placeholder="https://plan.setthedate.app/poll/..." />
              </label>
              <label className="block text-sm font-semibold">Your message
                <textarea className={inputClass + ' mt-2'} rows={5} minLength={8} maxLength={4000} required
                  value={contact.message} onChange={(event) => change('message', event.target.value)}
                  placeholder="Tell us what happened and what you would like to do." />
              </label>
              <div className="hidden" aria-hidden="true">
                <label>Website<input tabIndex={-1} autoComplete="off"
                  value={contact.website} onChange={(event) => change('website', event.target.value)} /></label>
              </div>
              <button type="submit" disabled={contactLoading}
                className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-60 sm:w-auto">
                {contactLoading ? 'Sending…' : 'Send message'}
              </button>
              {contactMessage && <p className="text-sm text-slate-800" role="status">{contactMessage}</p>}
            </form>
            <p className="mt-5 text-sm text-slate-700">
              Prefer email? <a className="font-semibold underline" href="mailto:hello@setthedate.app">hello@setthedate.app</a>
            </p>
          </section>
        </div>
      </main>
    </HubShell>
  );
}
