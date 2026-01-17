import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import LogoHeader from '@/components/LogoHeader';
import PortalTopNav from '@/components/PortalTopNav';
import { auth, db } from '@/lib/firebase';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';
import { buildCampaignText, buildPartnerLinks } from '@/lib/partners/emailTemplates';

const MAX_POLLS_PER_FETCH = 25;
const MAX_VENUE_POLL_BATCHES = 5;
const MAX_PORTAL_VENUES = (() => {
  const limit = Number.parseInt(process.env.NEXT_PUBLIC_PORTAL_MAX_VENUES || '3', 10);
  return Number.isFinite(limit) && limit > 0 ? limit : 3;
})();

const normalizePortalType = (type) => (type === 'venue' ? 'venue' : 'pro');
const getPortalPath = (type) =>
  normalizePortalType(type) === 'venue' ? '/venues/portal' : '/pro/portal';
const getLoginPath = (type) =>
  normalizePortalType(type) === 'venue' ? '/venues/login' : '/pro/login';

const resolveLoginHref = (type, redirectPath = '') => {
  const base = getLoginPath(type);
  const params = new URLSearchParams();
  if (redirectPath) {
    params.set('redirect', redirectPath);
  }
  const queryString = params.toString();
  return queryString ? `${base}?${queryString}` : base;
};

export default function PortalDashboard({ forcedType } = {}) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [venues, setVenues] = useState([]);
  const [polls, setPolls] = useState([]);
  const [activeVenueSlug, setActiveVenueSlug] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [loadingPolls, setLoadingPolls] = useState(false);
  const [portalError, setPortalError] = useState('');
  const [billingData, setBillingData] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [billingActionLoading, setBillingActionLoading] = useState(false);
  const [launchingVenue, setLaunchingVenue] = useState(false);
  const [venueLaunchError, setVenueLaunchError] = useState('');
  const [enterpriseOrganisation, setEnterpriseOrganisation] = useState('');
  const [enterprisePhone, setEnterprisePhone] = useState('');
  const [enterpriseMessage, setEnterpriseMessage] = useState('');
  const [enterpriseSubmitting, setEnterpriseSubmitting] = useState(false);
  const [enterpriseError, setEnterpriseError] = useState('');
  const [enterpriseSuccess, setEnterpriseSuccess] = useState(false);
  const [enterpriseContactVisible, setEnterpriseContactVisible] = useState(false);

  const fallbackType = forcedType
    ? normalizePortalType(forcedType)
    : normalizePortalType(typeof router.query?.type === 'string' ? router.query.type : 'pro');
  const portalType = normalizePortalType(profile?.type || fallbackType);
  const modeLabel = portalType === 'venue' ? 'Venue partner portal' : 'Pro organiser portal';
  const signedInEmail = user?.email || profile?.email || '';
  const venueLimit = MAX_PORTAL_VENUES;
  const venueCount = venues.length;
  const hasReachedVenueLimit = portalType === 'venue' && venueCount >= venueLimit;
  const remainingVenueSlots = Math.max(venueLimit - venueCount, 0);
  const showEnterpriseContact = portalType === 'venue' && (hasReachedVenueLimit || enterpriseContactVisible);

  const selectedVenue = useMemo(() => {
    if (!venues.length) return null;
    return venues.find((venue) => venue.slug === activeVenueSlug) || venues[0];
  }, [activeVenueSlug, venues]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoadingAuth(false);
      if (!firebaseUser) {
        router.replace(resolveLoginHref(fallbackType));
      }
    });
    return () => unsubscribe();
  }, [router, fallbackType]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadingProfile(true);

    const fetchProfile = async () => {
      try {
        const profileRef = doc(db, 'portalUsers', user.uid);
        const snapshot = await getDoc(profileRef);
        if (cancelled) return;

        if (snapshot.exists()) {
          setProfile({ id: snapshot.id, ...snapshot.data() });
        } else {
          setProfile({
            id: user.uid,
            email: user.email,
            type: fallbackType,
            unlocked: false,
          });
        }
      } catch (error) {
        console.error('portal profile load failed', error);
        if (!cancelled) {
          setPortalError('Unable to load your portal profile right now.');
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    };

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [user, fallbackType]);

  useEffect(() => {
    if (!forcedType || !profile?.type) return;
    const desiredType = normalizePortalType(forcedType);
    const actualType = normalizePortalType(profile.type);
    if (actualType !== desiredType) {
      router.replace(getPortalPath(actualType));
    }
  }, [forcedType, profile?.type, router]);

  useEffect(() => {
    if (!portalType) return;
    logEventIfAvailable('portal_dashboard_view', { type: portalType });
  }, [portalType]);

  useEffect(() => {
    if (hasReachedVenueLimit) {
      setEnterpriseContactVisible(true);
    }
  }, [hasReachedVenueLimit]);

  useEffect(() => {
    if (!venues.length) return;
    const hasActive = venues.some((venue) => venue.slug === activeVenueSlug);
    if (!hasActive) {
      setActiveVenueSlug(venues[0].slug);
    }
  }, [activeVenueSlug, venues]);

  useEffect(() => {
    if (!showEnterpriseContact) {
      setEnterpriseError('');
      setEnterpriseSuccess(false);
      return;
    }
    if (enterpriseMessage.trim()) {
      return;
    }
    const accountLabel = signedInEmail ? ` for ${signedInEmail}` : '';
    setEnterpriseMessage(
      `Hi Set The Date team,\n\nWe now have ${venueCount} venues live${accountLabel} and need to unlock enterprise coverage for additional locations.\n\nThanks!`
    );
  }, [showEnterpriseContact, enterpriseMessage, signedInEmail, venueCount]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchBilling = async () => {
      setBillingError('');
      setBillingLoading(true);
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/portal/billing', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load billing details.');
        }
        if (!cancelled) {
          setBillingData(payload);
        }
      } catch (error) {
        console.error('portal billing load failed', error);
        if (!cancelled) {
          setBillingData(null);
          setBillingError(error?.message || 'Unable to load billing right now.');
        }
      } finally {
        if (!cancelled) {
          setBillingLoading(false);
        }
      }
    };

    fetchBilling();
    return () => {
      cancelled = true;
    };
  }, [user, portalType]);

  useEffect(() => {
    if (!user || portalType !== 'venue') {
      setVenues([]);
      return;
    }

    let cancelled = false;
    const fetchVenues = async () => {
      setLoadingVenues(true);
      try {
        const emailLower = (user.email || '').trim().toLowerCase();
        const partnersRef = collection(db, 'partners');
        const venueQuery = query(partnersRef, where('contactEmail', '==', emailLower));
        const snapshot = await getDocs(venueQuery);
        if (cancelled) return;
        const docs = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          slug: docSnapshot.id,
          ...docSnapshot.data(),
        }));
        setVenues(docs);
        if (docs.length && !docs.some((docItem) => docItem.slug === activeVenueSlug)) {
          setActiveVenueSlug(docs[0].slug);
        }
      } catch (error) {
        console.error('portal venue load failed', error);
        if (!cancelled) {
          setPortalError('Unable to load venues linked to this account.');
          setVenues([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingVenues(false);
        }
      }
    };

    fetchVenues();
    return () => {
      cancelled = true;
    };
  }, [user, portalType]);

  useEffect(() => {
    if (!user || !portalType) return;
    let cancelled = false;

    const fetchPolls = async () => {
      setLoadingPolls(true);
      try {
        if (portalType === 'venue') {
          if (!venues.length) {
            setPolls([]);
            return;
          }
          const venueSlices = venues.slice(0, MAX_VENUE_POLL_BATCHES);
          const pollResults = [];
          for (const venue of venueSlices) {
            const pollsRef = collection(db, 'polls');
            const venuePollQuery = query(pollsRef, where('partnerSlug', '==', venue.slug), limit(5));
            const snapshot = await getDocs(venuePollQuery);
            snapshot.forEach((docSnapshot) => {
              pollResults.push({
                id: docSnapshot.id,
                partnerName: venue.venueName,
                ...docSnapshot.data(),
              });
            });
          }
          pollResults.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
          if (!cancelled) {
            setPolls(pollResults.slice(0, MAX_POLLS_PER_FETCH));
          }
        } else {
          const emailVariants = Array.from(
            new Set([user.email, user.email?.toLowerCase()].filter(Boolean))
          );
          if (!emailVariants.length) {
            setPolls([]);
            return;
          }
          const pollsRef = collection(db, 'polls');
          const proPollQuery = query(
            pollsRef,
            where('organiserEmail', 'in', emailVariants),
            limit(MAX_POLLS_PER_FETCH)
          );
          const snapshot = await getDocs(proPollQuery);
          if (!cancelled) {
            const docs = snapshot.docs
              .map((docSnapshot) => ({
                id: docSnapshot.id,
                ...docSnapshot.data(),
              }))
              .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
            setPolls(docs);
          }
        }
      } catch (error) {
        console.error('portal poll load failed', error);
        if (!cancelled) {
          setPortalError('Unable to load recent polls right now.');
          setPolls([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingPolls(false);
        }
      }
    };

    fetchPolls();
    return () => {
      cancelled = true;
    };
  }, [user, portalType, venues]);

  const handleManageBilling = async () => {
    if (!user) return;
    setBillingError('');
    setBillingActionLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/billing/customer-portal', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'Unable to open Stripe billing portal.');
      }
      if (typeof window !== 'undefined') {
        window.location.assign(payload.url);
      }
    } catch (error) {
      console.error('portal billing portal open failed', error);
      setBillingError(error?.message || 'Unable to open Stripe billing portal.');
    } finally {
      setBillingActionLoading(false);
    }
  };

  const scrollToEnterpriseContact = useCallback(() => {
    if (typeof window === 'undefined') return;
    const el = document.getElementById('enterprise-contact');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handleLaunchVenue = useCallback(async () => {
    if (!user || portalType !== 'venue') return;
    if (venueCount >= venueLimit) {
      setEnterpriseContactVisible(true);
      scrollToEnterpriseContact();
      return;
    }

    setVenueLaunchError('');
    setLaunchingVenue(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/portal/issueVenueToken', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload?.contactRequired) {
          setEnterpriseContactVisible(true);
          scrollToEnterpriseContact();
        }
        throw new Error(payload?.error || 'Unable to launch a new venue right now.');
      }

      const onboardingToken = payload?.onboardingToken;
      if (!onboardingToken) {
        throw new Error('Missing onboarding token from server.');
      }
      router.push(`/venues/signup?token=${encodeURIComponent(onboardingToken)}`);
    } catch (error) {
      console.error('portal launch venue failed', error);
      setVenueLaunchError(error?.message || 'Unable to launch a new venue right now.');
    } finally {
      setLaunchingVenue(false);
    }
  }, [
    portalType,
    router,
    scrollToEnterpriseContact,
    user,
    venueCount,
    venueLimit,
  ]);

  const handleVenueUpdate = useCallback((updatedVenue) => {
    if (!updatedVenue?.slug) return;
    setVenues((prev) =>
      prev.map((venueItem) =>
        venueItem.slug === updatedVenue.slug ? { ...venueItem, ...updatedVenue } : venueItem
      )
    );
  }, []);

  const handleEnterpriseSubmit = useCallback(
    async (event) => {
      event?.preventDefault?.();
      if (!user) {
        setEnterpriseError('Sign in to your portal to send this request.');
        return;
      }
      if (!enterpriseMessage.trim()) {
        setEnterpriseError('Add a short note before sending.');
        return;
      }
      setEnterpriseSubmitting(true);
      setEnterpriseError('');
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/portal/enterpriseContact', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organisation: enterpriseOrganisation,
            phone: enterprisePhone,
            message: enterpriseMessage,
            venues: venueCount,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to submit your request right now.');
        }
        setEnterpriseSuccess(true);
      } catch (error) {
        console.error('enterprise contact submit failed', error);
        setEnterpriseError(error?.message || 'Unable to submit your request right now.');
      } finally {
        setEnterpriseSubmitting(false);
      }
    },
    [enterpriseMessage, enterpriseOrganisation, enterprisePhone, user, venueCount]
  );

  const handlePortalSignOut = async () => {
    try {
      await signOut(auth);
      router.replace(resolveLoginHref(portalType || fallbackType));
    } catch (error) {
      console.error('portal sign out failed', error);
      setPortalError('Unable to sign out right now. Please try again in a moment.');
    }
  };

  const summaryCards = useMemo(() => {
    const cards = [
      {
        label: portalType === 'venue' ? 'Venues live' : 'Polls created',
        value: portalType === 'venue' ? venues.length : polls.length,
        detail: portalType === 'venue' ? 'Linked to your login' : 'Across all organisers',
      },
      {
        label: 'Recent polls',
        value: polls.length ? Math.min(polls.length, MAX_POLLS_PER_FETCH) : 0,
        detail: 'Synced from Firestore',
      },
      {
        label: 'Portal type',
        value: portalType === 'venue' ? 'Venue partner' : 'Pro organiser',
        detail: 'Set in your portal profile',
      },
    ];

    if (signedInEmail) {
      cards.push({
        label: 'Signed in as',
        value: signedInEmail,
        detail: 'Account email',
      });
    }

    return cards;
  }, [portalType, venues.length, polls.length, signedInEmail]);

  if (!user && loadingAuth) {
    return null;
  }

  if (!user && !loadingAuth) {
    return (
      <>
        <Head>
          <title>Portal login required - Set The Date</title>
        </Head>
        <PortalTopNav isLoggedIn={false} portalType={portalType || fallbackType} />
        <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4">
          <div className="rounded-3xl bg-white text-slate-900 px-6 py-8 shadow-2xl shadow-slate-900/30 text-center space-y-3">
            <LogoHeader isPro />
            <p className="text-sm text-slate-600">Redirecting you to the login page…</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{modeLabel} - Set The Date</title>
      </Head>
      <PortalTopNav
        isLoggedIn={Boolean(user)}
        portalType={portalType || fallbackType}
        userEmail={signedInEmail}
        onSignOut={handlePortalSignOut}
      />
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-12">
        <div className="max-w-6xl mx-auto text-slate-900">
          <div className="flex flex-col items-center text-center mb-12 rounded-[32px] bg-white shadow-2xl shadow-slate-900/20 px-8 py-10">
            <LogoHeader isPro />
            <p className="uppercase tracking-[0.35em] text-xs text-slate-500 mt-4">Dashboard</p>
            <h1 className="text-4xl font-semibold mt-2 text-slate-900">{modeLabel}</h1>
            <p className="text-slate-600 mt-3 max-w-2xl">
              {signedInEmail
                ? `Signed in as ${signedInEmail}.`
                : 'Sign in to see the venues and polls linked to your account.'}
              {' '}
              Manage your public venue cards, grab the share links, and keep an eye on active polls.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {portalType === 'venue' && (
                <button
                  type="button"
                  onClick={handleLaunchVenue}
                  disabled={launchingVenue}
                  className={`rounded-full px-6 py-2 font-semibold text-white shadow transition ${
                    hasReachedVenueLimit
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-slate-900 hover:bg-slate-800'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {launchingVenue
                    ? 'Preparing builder...'
                    : hasReachedVenueLimit
                    ? 'Contact enterprise'
                    : 'Launch new venue'}
                </button>
              )}
              {portalType !== 'venue' && (
                <Link
                  href="/pro/pricing"
                  className="rounded-full border border-slate-300 px-6 py-2 text-slate-600 hover:border-slate-900"
                >
                  View plans
                </Link>
              )}
            </div>
            {venueLaunchError && (
              <p className="mt-2 text-sm text-rose-600">{venueLaunchError}</p>
            )}
            {portalType === 'venue' && (
              <p className="mt-2 text-xs text-slate-500">
                {hasReachedVenueLimit
                  ? `You've published ${venueCount}/${venueLimit} venues included with this plan.`
                  : `You can launch ${remainingVenueSlots} more venue${remainingVenueSlots === 1 ? '' : 's'} on this plan.`}
              </p>
            )}
            <nav
              className="mt-5 flex flex-wrap justify-center gap-2"
              aria-label="Portal quick links"
            >
              <a
                href="#billing"
                className="rounded-full border border-slate-900 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-900 hover:bg-slate-900 hover:text-white transition"
              >
                Billing
              </a>
              {portalType === 'venue' && (
                <a
                  href="#venues"
                  className="rounded-full border border-slate-200 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 hover:border-slate-900"
                >
                  Venues
                </a>
              )}
              <button
                type="button"
                onClick={handlePortalSignOut}
                className="rounded-full border border-slate-200 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 hover:border-rose-500 hover:text-rose-600"
              >
                Log out
              </button>
            </nav>
          </div>

          {portalError && (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 text-sm">
              {portalError}
            </div>
          )}

          <BillingPanel
            portalType={portalType}
            billingData={billingData}
            loading={billingLoading}
            error={billingError}
            onManageBilling={handleManageBilling}
            actionLoading={billingActionLoading}
          />

          {portalType !== 'venue' && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-10">
              {summaryCards.map((card) => (
                <StatCard key={card.label} {...card} />
              ))}
            </div>
          )}

          {portalType !== 'venue' && (
            <section className="rounded-3xl border border-white bg-white/95 shadow-xl shadow-slate-900/10 p-6 mb-8">
              <header className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Recent polls</h2>
                  <p className="text-slate-500 text-sm">
                    Polls you have created as an organiser.
                  </p>
                </div>
                <Link href="/" className="text-sm text-slate-500 underline">
                  Create poll
                </Link>
              </header>
              {loadingPolls ? (
                <p className="text-sm text-slate-500">Loading polls…</p>
              ) : polls.length ? (
                <ul className="space-y-3 text-sm text-slate-700">
                  {polls.map((poll) => (
                    <li
                      key={poll.id}
                      className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                    >
                      <p className="font-semibold text-slate-900 flex items-center justify-between gap-3">
                        <span>{poll.eventTitle || 'Untitled event'}</span>
                        <span className="text-xs text-slate-400">
                          {formatDateLabel(poll.createdAt)}
                        </span>
                      </p>
                      <p className="text-slate-500">
                        {poll.location || poll.partnerSlug || 'No location specified'}
                      </p>
                      {poll.partnerName && (
                        <p className="text-xs uppercase tracking-[0.35em] text-slate-400 mt-1">
                          {poll.partnerName}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">
                  No organiser polls found for this login.
                </p>
              )}
            </section>
          )}

          {portalType === 'venue' && (
            <section
              id="venues"
              className="scroll-mt-28 rounded-3xl border border-white bg-white/95 shadow-xl shadow-slate-900/10 p-6 mb-8"
            >
              <header className="mb-4 text-left">
                <p className="uppercase tracking-[0.3em] text-xs text-slate-500">Your venues</p>
                <h2 className="text-2xl font-semibold text-slate-900">Manage public pages</h2>
                <p className="text-sm text-slate-500 mt-1">
                  View each venue page, copy the slug, or jump into settings to refresh imagery.
                </p>
              </header>

              {loadingVenues ? (
                <p className="text-sm text-slate-500">Loading venues…</p>
              ) : venues.length ? (
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {venues.map((venue) => (
                      <button
                        key={venue.slug}
                        type="button"
                        onClick={() => setActiveVenueSlug(venue.slug)}
                        className={`rounded-full px-4 py-1 text-sm font-semibold border transition ${
                          activeVenueSlug === venue.slug
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'border-slate-300 text-slate-600 hover:border-slate-900'
                        }`}
                      >
                        {venue.venueName || venue.slug}
                      </button>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-700">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-2">Name</th>
                          <th>Slug</th>
                          <th>City</th>
                          <th className="text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {venues.map((venue) => (
                          <tr
                            key={venue.slug}
                            className={`border-t border-slate-100 ${
                              activeVenueSlug === venue.slug ? 'bg-slate-50' : ''
                            }`}
                          >
                            <td className="py-3 font-semibold text-slate-900">
                              {venue.venueName || 'Untitled venue'}
                            </td>
                            <td className="py-3">
                              <Link href={`/p/${venue.slug}`} target="_blank" className="text-slate-900 underline">
                                /p/{venue.slug}
                              </Link>
                            </td>
                            <td className="py-3">{venue.city || '—'}</td>
                            <td className="py-3 text-center">
                              <div className="flex flex-col md:flex-row gap-2 justify-center">
                                <Link
                                  href={`/p/${venue.slug}`}
                                  target="_blank"
                                  className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900"
                                >
                                  View share page
                                </Link>
                                <Link
                                  href={`/p/${venue.slug}#settings`}
                                  target="_blank"
                                  className="inline-flex items-center justify-center rounded-full bg-slate-900 text-white px-4 py-1 text-xs font-semibold"
                                >
                                  Open settings
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {selectedVenue && (
                  <div className="mt-8">
                    <VenueEmailTemplate venue={selectedVenue} onVenueUpdate={handleVenueUpdate} />
                  </div>
                )}
              </>
            ) : (
                <p className="text-sm text-slate-500">
                  No venues are linked to {signedInEmail || 'this account'} yet.{' '}
                  <button
                    type="button"
                    onClick={handleLaunchVenue}
                    className="underline font-semibold text-slate-900"
                  >
                    Launch one now.
                  </button>
                </p>
              )}
              {!loadingVenues && (
                <p className="mt-4 text-xs text-slate-500">
                  {hasReachedVenueLimit
                    ? `You have reached the ${venueLimit}-venue allowance for this plan.`
                    : `You can add ${remainingVenueSlots} more venue${remainingVenueSlots === 1 ? '' : 's'} before we switch you to enterprise.`}
                </p>
              )}
              {showEnterpriseContact && (
                <EnterpriseContactForm
                  venueCount={venueCount}
                  venueLimit={venueLimit}
                  organisation={enterpriseOrganisation}
                  phone={enterprisePhone}
                  message={enterpriseMessage}
                  onOrganisationChange={setEnterpriseOrganisation}
                  onPhoneChange={setEnterprisePhone}
                  onMessageChange={setEnterpriseMessage}
                  submitting={enterpriseSubmitting}
                  success={enterpriseSuccess}
                  error={enterpriseError}
                  onSubmit={handleEnterpriseSubmit}
                />
              )}
            </section>
          )}

          {portalType !== 'venue' && (
            <section className="rounded-3xl border border-white bg-white/95 shadow-xl shadow-slate-900/10 p-6 text-center">
              <p className="text-sm font-semibold text-slate-900">Share Set The Date</p>
              <p className="text-slate-600 text-sm mt-2 max-w-2xl mx-auto">
                Share this dashboard with trusted venues or organisers. Every partner you invite keeps the dinner
                calendar moving.
              </p>
              <div className="mt-4 flex flex-col md:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined' && navigator?.clipboard?.writeText) {
                      navigator.clipboard.writeText(`${window.location.origin}/pro/pricing`);
                    }
                  }}
                  className="rounded-full border border-slate-900 px-6 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white transition"
                >
                  Copy share link
                </button>
                <Link
                  href="/pro/pricing"
                  className="rounded-full bg-slate-900 text-white text-sm font-semibold px-6 py-2 shadow"
                >
                  See referral details
                </Link>
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}

function BillingPanel({
  portalType,
  billingData,
  loading,
  error,
  onManageBilling,
  actionLoading,
}) {
  const hasStripeProfile = Boolean(billingData?.stripeCustomerId);
  const subscription = billingData?.subscription || null;
  const invoices = Array.isArray(billingData?.invoices) ? billingData.invoices : [];
  const planName =
    subscription?.priceNickname ||
    (portalType === 'venue' ? 'Venue partner plan' : 'Set The Date Pro');
  const amountLabel =
    typeof subscription?.amount === 'number'
      ? formatCurrency(subscription.amount, subscription.currency)
      : '—';
  const statusLabel = subscription?.status
    ? subscription.status.replace(/_/g, ' ')
    : hasStripeProfile
    ? 'Active'
    : 'Not active';
  const nextRenewal = subscription?.current_period_end
    ? formatUnixDate(subscription.current_period_end)
    : '—';

  return (
    <section
      id="billing"
      className="rounded-3xl border border-white bg-white/95 shadow-xl shadow-slate-900/10 p-6 mb-8"
    >
      <header className="mb-4">
        <p className="uppercase tracking-[0.3em] text-xs text-slate-500">Billing &amp; payments</p>
        <h2 className="text-2xl font-semibold text-slate-900">Stripe subscription</h2>
        <p className="text-sm text-slate-500">
          See your current plan, next renewal date, and download receipts. Data syncs directly from Stripe.
        </p>
      </header>

      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading billing details…</p>
      ) : (
        <>
          <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
            <div className="flex-1 rounded-2xl bg-slate-900 text-white p-5 space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Current plan</p>
              <p className="text-2xl font-semibold">{planName}</p>
              <p className="text-sm text-slate-200">
                Amount {amountLabel} | Status {statusLabel}
              </p>
              <p className="text-sm text-slate-200">Next renewal {nextRenewal}</p>
              <p className="text-xs text-slate-400">Stripe sync is automatic for this account.</p>
            </div>
            <div className="w-full md:w-72 rounded-2xl border border-slate-200 p-5 text-left">
              {hasStripeProfile ? (
                <>
                  <button
                    type="button"
                    onClick={onManageBilling}
                    disabled={actionLoading}
                    className="w-full rounded-full bg-slate-900 text-white text-sm font-semibold px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading ? 'Opening Stripe…' : 'Manage billing in Stripe'}
                  </button>
                  <p className="text-xs text-slate-500 mt-2">
                    Cancel your subscription, update payment methods, or download invoices directly from
                    Stripe.
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  We could not find a Stripe subscription linked to this login yet. If you recently upgraded,
                  refresh this page or contact support and we will attach your billing profile.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-900 mb-2">Payment history</p>
            {hasStripeProfile && invoices.length ? (
              <ul className="space-y-2">
                {invoices.map((invoice) => {
                  const amountSource =
                    typeof invoice.amount_paid === 'number' && invoice.amount_paid > 0
                      ? invoice.amount_paid
                      : invoice.amount_due;
                  return (
                    <li
                      key={invoice.id}
                      className="rounded-2xl border border-slate-100 bg-white p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                    >
                      <div>
                        <p className="text-base font-semibold text-slate-900">
                          {formatCurrency(amountSource, invoice.currency)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {invoice.number ? `Invoice ${invoice.number}` : 'Invoice'} |{' '}
                          {formatUnixDate(invoice.created)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-xs uppercase tracking-[0.3em] ${
                            invoice.paid ? 'text-emerald-500' : 'text-amber-500'
                          }`}
                        >
                          {(invoice.status || (invoice.paid ? 'paid' : 'open')).replace(/_/g, ' ')}
                        </span>
                        {invoice.hosted_invoice_url && (
                          <a
                            href={invoice.hosted_invoice_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs text-slate-500 underline mt-1"
                          >
                            View receipt
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">
                {hasStripeProfile
                  ? 'No invoices yet. Your first payment will appear here once Stripe processes it.'
                  : 'Billing history will populate once your Stripe subscription is active.'}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function EnterpriseContactForm({
  venueCount,
  venueLimit,
  organisation,
  phone,
  message,
  onOrganisationChange,
  onPhoneChange,
  onMessageChange,
  onSubmit,
  submitting,
  success,
  error,
}) {
  return (
    <div
      id="enterprise-contact"
      className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-slate-900"
    >
      <p className="text-xs uppercase tracking-[0.35em] text-amber-600">Enterprise</p>
      <h3 className="text-xl font-semibold mt-1">Need more than {venueLimit} venues?</h3>
      <p className="text-sm text-slate-700 mb-4">
        Tell us about the additional locations you want to onboard and we will reach out with enterprise
        pricing. Currently {venueCount}/{venueLimit} venues are live on this login.
      </p>
      {success ? (
        <p className="text-sm font-semibold text-emerald-600">
          Thanks! We received your request and will be in touch shortly.
        </p>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="enterprise-organisation">
              Organisation or group name
            </label>
            <input
              id="enterprise-organisation"
              type="text"
              value={organisation}
              onChange={(event) => onOrganisationChange?.(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              placeholder="e.g. Downtown Hospitality Group"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="enterprise-phone">
              Phone number (optional)
            </label>
            <input
              id="enterprise-phone"
              type="tel"
              value={phone}
              onChange={(event) => onPhoneChange?.(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              placeholder="+44 20 7946 0958"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="enterprise-message">
              Tell us about the rollout
            </label>
            <textarea
              id="enterprise-message"
              value={message}
              onChange={(event) => onMessageChange?.(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              rows={4}
            />
            <p className="text-xs text-slate-500 mt-1">
              Include how many venues you want to add and any timelines we should know about.
            </p>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-slate-900 text-white text-sm font-semibold px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending...' : 'Request enterprise access'}
          </button>
        </form>
      )}
    </div>
  );
}

function VenueEmailTemplate({ venue, onVenueUpdate }) {
  const [copyStatus, setCopyStatus] = useState('');
  const [subjectDraft, setSubjectDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const [campaignDraft, setCampaignDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const copyTimerRef = useRef(null);

  const defaults = useMemo(() => {
    const locationParts = [venue?.city, venue?.region, venue?.country].filter(Boolean);
    const locationLabel = locationParts.length ? ` in ${locationParts.join(', ')}` : '';
    const resolvedVenueName = venue?.venueName || 'your venue';
    const partnerLinks = buildPartnerLinks(venue);
    const campaign = buildCampaignText(venue);
    const subjectText = `Invite guests to vote for ${resolvedVenueName}${locationLabel}`;
    const bodyText = [
      'Hi there,',
      '',
      `Thinking about getting friends together at ${resolvedVenueName}${locationLabel}?`,
      '',
      'We have set up a simple date poll that lets your group choose the best night in under a minute. No logins, no app to install.',
      '',
      'Open the link below.',
      '',
      'Pick a few dates that could work.',
      '',
      'Share your invite link in WhatsApp, text or email so everyone can vote Best / Maybe / No.',
      '',
      'When the votes are in, you will see which date works best for most people and can come back to us to book your table.',
      '',
      `Start your poll here:\n${partnerLinks.shareUrl}`,
      '',
      'We would love to welcome you and your friends soon.',
      '',
      'Thanks,',
      `${resolvedVenueName} team`,
    ].join('\n');
    return {
      subject: subjectText,
      body: bodyText,
      campaign,
      venueName: resolvedVenueName,
      locationLabel,
    };
  }, [venue]);

  useEffect(() => {
    setSubjectDraft(
      venue?.customEmailSubject && venue?.customEmailSubject.trim()
        ? venue.customEmailSubject
        : defaults.subject
    );
    setBodyDraft(
      venue?.customEmailBody && venue?.customEmailBody.trim()
        ? venue.customEmailBody
        : defaults.body
    );
    setCampaignDraft(
      venue?.customEmailCampaign && venue?.customEmailCampaign.trim()
        ? venue.customEmailCampaign
        : defaults.campaign
    );
  }, [venue, defaults]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSaveMessage('');
    setSaveError('');
  }, [subjectDraft, bodyDraft, campaignDraft]);

  const mailtoHref = useMemo(() => {
    const subject = subjectDraft || defaults.subject;
    const body = bodyDraft || defaults.body;
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [subjectDraft, bodyDraft, defaults]);

  const subjectSuggestions = useMemo(() => {
    const subjectBase = defaults.subject;
    const altPlan = `Plan your next night at ${defaults.venueName}${defaults.locationLabel}`;
    const altGather = `Get your friends together at ${defaults.venueName} – pick a date`;
    return [
      { label: 'Invite guests', value: subjectBase },
      { label: 'Plan your night', value: altPlan },
      { label: 'Gather friends', value: altGather },
    ];
  }, [defaults]);

  const handleCopy = (text, label) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopyStatus('Copy not supported in this browser');
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopyStatus(`${label} copied`);
        if (copyTimerRef.current) {
          clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = setTimeout(() => setCopyStatus(''), 2500);
      })
      .catch(() => {
        setCopyStatus('Unable to copy right now');
      });
  };

  const handleSave = useCallback(async () => {
    if (!venue?.slug) return;
    setSaving(true);
    setSaveError('');
    setSaveMessage('');

    try {
      const response = await fetch('/api/partners/updateAssets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug: venue.slug,
          emailSubject: subjectDraft,
          emailBody: bodyDraft,
          emailCampaign: campaignDraft,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to save the email content right now.');
      }
      const updatedVenue = payload?.partner || {};
      if (Object.keys(updatedVenue).length) {
        onVenueUpdate?.(updatedVenue);
      }
      setSaveMessage('Email content saved.');
    } catch (error) {
      setSaveError(error?.message || 'Unable to save the email content right now.');
    } finally {
      setSaving(false);
    }
  }, [bodyDraft, campaignDraft, onVenueUpdate, subjectDraft, venue?.slug]);

  return (
    <div className="rounded-3xl border border-slate-100 bg-white/95 p-6 space-y-5 text-slate-900">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Email template</p>
        <h3 className="text-xl font-semibold text-slate-900">
          Share {defaults.venueName}
          {defaults.locationLabel}
        </h3>
        <p className="text-sm text-slate-500">
          Edit, copy, and open the email copy right from this portal.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Subject</p>
              <button
                type="button"
                onClick={() => handleCopy(subjectDraft, 'Subject')}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-900 hover:text-slate-900"
              >
                Copy
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {subjectSuggestions.map((suggestion) => (
                <button
                  key={suggestion.value}
                  type="button"
                  onClick={() => setSubjectDraft(suggestion.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                    subjectDraft === suggestion.value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-700 hover:border-slate-900 hover:text-slate-900'
                  }`}
                  title={suggestion.value}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            value={subjectDraft}
            onChange={(event) => setSubjectDraft(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            Alternative options above make it quick to update the subject before you copy or send.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Guest invite</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(bodyDraft, 'Guest invite')}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-900 hover:text-slate-900"
              >
                Copy
              </button>
              <a
                href={mailtoHref}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white hover:bg-slate-800"
              >
                Email now
              </a>
            </div>
          </div>
          <textarea
            value={bodyDraft}
            onChange={(event) => setBodyDraft(event.target.value)}
            rows={6}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">CRM campaign copy</p>
            <p className="text-xs text-slate-500">Shorter blurb for a campaign block, sidebar, or PS.</p>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(campaignDraft, 'Campaign copy')}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-900 hover:text-slate-900"
          >
            Copy
          </button>
        </div>
        <textarea
          value={campaignDraft}
          onChange={(event) => setCampaignDraft(event.target.value)}
          rows={4}
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
        >
          {saving ? 'Saving...' : 'Save email content'}
        </button>
        {copyStatus && <p className="text-xs font-semibold text-emerald-600">{copyStatus}</p>}
        {saveMessage && (
          <p className="text-xs font-semibold text-emerald-600">{saveMessage}</p>
        )}
        {saveError && <p className="text-xs font-semibold text-rose-600">{saveError}</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value, detail }) {
  return (
    <div className="rounded-3xl border border-white bg-white/95 shadow-md shadow-slate-900/10 p-5 text-slate-900">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">{label}</p>
      <p className="text-3xl font-semibold break-words">{value ?? '—'}</p>
      {detail && <p className="text-sm text-slate-500">{detail}</p>}
    </div>
  );
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return new Date(value).getTime() || 0;
}

function formatDateLabel(value) {
  const millis = toMillis(value);
  if (!millis) return '—';
  return new Date(millis).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatCurrency(amount, currency = 'gbp') {
  if (typeof amount !== 'number') return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatUnixDate(value) {
  const millis =
    typeof value === 'number'
      ? value * 1000
      : toMillis(value);
  if (!millis) return '—';
  return new Date(millis).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
