import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { isAdminEmail } from '@/lib/adminUsers';

const provider = new GoogleAuthProvider();
const MAX_LINKS = 3;

const formatMoney = (amount, currency) => {
  if (typeof amount !== 'number') return '—';
  const safeCurrency = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: safeCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(0)} ${safeCurrency}`;
  }
};

const formatDate = (millis) => {
  if (!millis) return '—';
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

export default function AdminRentalsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [owners, setOwners] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [includeBilling, setIncludeBilling] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser && isAdminEmail(firebaseUser.email)) {
        setUser(firebaseUser);
      } else {
        setUser(null);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const loadOwners = useCallback(
    async (billing = includeBilling) => {
      if (!user) return;
      setFetching(true);
      setError('');
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/admin/rentals/owners?billing=${billing ? '1' : '0'}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load rentals owners.');
        }
        setOwners(Array.isArray(payload?.owners) ? payload.owners : []);
        setLastLoadedAt(payload?.generatedAt || Date.now());
      } catch (loadError) {
        console.error('admin rentals load failed', loadError);
        setError(loadError?.message || 'Unable to load rentals owners.');
      } finally {
        setFetching(false);
      }
    },
    [includeBilling, user]
  );

  useEffect(() => {
    if (user) {
      loadOwners(includeBilling);
    }
  }, [includeBilling, loadOwners, user]);

  const login = () => {
    signInWithPopup(auth, provider).catch((loginError) => {
      console.error('admin rentals login failed', loginError);
      setError('Login failed. Try again.');
    });
  };

  const filteredOwners = useMemo(() => {
    const term = normalizeText(search).toLowerCase();
    if (!term) return owners;
    return owners.filter((owner) => {
      const properties = Array.isArray(owner.properties) ? owner.properties : [];
      const propertyTokens = properties
        .map((property) =>
          [property.propertyName, property.slug, property.id].filter(Boolean).join(' ')
        )
        .join(' ');
      const haystack = [
        owner.email,
        owner.name,
        owner.planTier,
        owner.subscriptionStatus,
        propertyTokens,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [owners, search]);

  const totals = useMemo(() => {
    const totalOwners = owners.length;
    const totalProperties = owners.reduce((sum, owner) => sum + (owner.propertyCount || 0), 0);
    const totalActive = owners.reduce((sum, owner) => {
      const activeCount = Array.isArray(owner.properties)
        ? owner.properties.filter((property) => property.active).length
        : 0;
      return sum + activeCount;
    }, 0);
    return { totalOwners, totalProperties, totalActive };
  }, [owners]);

  if (loadingAuth) {
    return <p className="p-6">Loading...</p>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <h1 className="text-2xl font-bold">Admin Login</h1>
        <p className="mt-2 text-sm text-gray-600">Only admin emails can access rentals billing.</p>
        <button
          onClick={login}
          className="mt-4 rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
        >
          Login with Google
        </button>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Admin Rentals - Set The Date</title>
      </Head>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">Admin: {user.email}</p>
            <h1 className="text-3xl font-bold">Admin Rentals</h1>
            <p className="text-sm text-gray-600">
              Track rental owners, their plan tiers, property counts, and billing snapshots.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/admin')}
              className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Back to dashboard
            </button>
            <button
              onClick={() => router.push('/rentals/pricing')}
              className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Rentals pricing
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-gray-700">
                <span className="font-semibold">{totals.totalOwners}</span> owners
              </div>
              <div className="text-sm text-gray-700">
                <span className="font-semibold">{totals.totalProperties}</span> properties
              </div>
              <div className="text-sm text-gray-700">
                <span className="font-semibold">{totals.totalActive}</span> active
              </div>
              {lastLoadedAt && (
                <div className="text-xs text-gray-500">
                  Updated {formatDate(lastLoadedAt)}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={includeBilling}
                  onChange={(event) => setIncludeBilling(event.target.checked)}
                />
                Include billing
              </label>
              <button
                onClick={() => loadOwners(includeBilling)}
                disabled={fetching}
                className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {fetching ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search owner email, plan tier, property name..."
              className="flex-1 min-w-[240px] rounded border px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Owner overview</h2>
            {fetching && <p className="text-xs text-gray-500">Loading...</p>}
          </div>
          {!filteredOwners.length ? (
            <p className="mt-3 text-sm text-gray-600">No rentals owners found.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b bg-gray-50">
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Plan tier</th>
                    <th className="px-3 py-2">Properties</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Last payment</th>
                    <th className="px-3 py-2">Plan price</th>
                    <th className="px-3 py-2">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOwners.map((owner) => {
                    const billing = owner.billing || {};
                    const properties = Array.isArray(owner.properties) ? owner.properties : [];
                    const propertyLimit = owner.propertyLimit;
                    const limitLabel =
                      typeof propertyLimit === 'number' ? propertyLimit : 'Custom';
                    const hasPaidAmount = billing.lastInvoiceAmount !== null && billing.lastInvoiceAmount !== undefined;
                    const paidLabel = hasPaidAmount
                      ? formatMoney(billing.lastInvoiceAmount, billing.lastInvoiceCurrency)
                      : billing.subscriptionStatus === 'trialing'
                      ? 'Trial'
                      : '—';
                    const paidMeta =
                      billing.lastInvoiceCreated && billing.lastInvoiceStatus
                        ? `${billing.lastInvoiceStatus} · ${formatDate(billing.lastInvoiceCreated)}`
                        : billing.lastInvoiceCreated
                        ? formatDate(billing.lastInvoiceCreated)
                        : '';
                    const planLabel = owner.planTier ? owner.planTier.toUpperCase() : 'UNKNOWN';
                    const hasPrice = billing.amountPerPeriod !== null && billing.amountPerPeriod !== undefined;
                    const priceLabel =
                      hasPrice && billing.currency
                        ? `${formatMoney(billing.amountPerPeriod, billing.currency)} / ${
                            billing.interval || 'period'
                          }`
                        : '—';
                    const displayedLinks = properties.slice(0, MAX_LINKS);
                    const remaining = properties.length - displayedLinks.length;

                    return (
                      <tr key={owner.id} className="border-b hover:bg-gray-50 align-top">
                        <td className="px-3 py-2">
                          <div className="font-semibold">{owner.email || 'Unknown'}</div>
                          {owner.name && (
                            <div className="text-xs text-gray-500">{owner.name}</div>
                          )}
                          <div className="text-[11px] text-gray-400">{owner.id}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-semibold">{planLabel}</div>
                          <div className="text-xs text-gray-500">{limitLabel} properties</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-semibold">{owner.propertyCount || 0}</div>
                          <div className="text-xs text-gray-500">Limit: {limitLabel}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="capitalize">{billing.subscriptionStatus || owner.subscriptionStatus || '—'}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-semibold">{paidLabel}</div>
                          {paidMeta && <div className="text-xs text-gray-500">{paidMeta}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-semibold">{priceLabel}</div>
                          {billing.priceNickname && (
                            <div className="text-xs text-gray-500">{billing.priceNickname}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {properties.length === 0 ? (
                            <span className="text-xs text-gray-500">No properties</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {displayedLinks.map((property) => {
                                const slug = property.slug || property.id;
                                const label = property.propertyName || slug || 'Property';
                                return (
                                  <a
                                    key={property.id}
                                    href={`/rentals/p/${slug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 underline"
                                  >
                                    {label}
                                  </a>
                                );
                              })}
                              {remaining > 0 && (
                                <span className="text-xs text-gray-500">
                                  +{remaining} more
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
