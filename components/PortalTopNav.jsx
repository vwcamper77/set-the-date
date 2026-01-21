import Image from 'next/image';
import Link from 'next/link';

const venueMarketingLinks = [
  { href: '/venues/pricing', label: 'Pricing' },
  { href: '/venues#how-it-works', label: 'Venue program' },
  { href: '/venues#partner-signup-form', label: 'Partner signup' },
];

const rentalsMarketingLinks = [
  { href: '/rentals/pricing', label: 'Pricing' },
  { href: '/rentals/how-it-works', label: 'How it works' },
  { href: '/rentals/signup', label: 'Owner signup' },
];

const proMarketingLinks = [
  { href: '/pro/pricing', label: 'Pricing' },
  { href: '/', label: 'Home' },
];

const normalizePortalType = (type) => (type === 'venue' || type === 'rentals' ? type : 'pro');
const getPortalBase = (type) => {
  const normalized = normalizePortalType(type);
  if (normalized === 'venue') return '/venues/portal';
  if (normalized === 'rentals') return '/rentals/portal';
  return '/pro/portal';
};
const getPortalLogin = (type) => {
  const normalized = normalizePortalType(type);
  if (normalized === 'venue') return '/venues/login';
  if (normalized === 'rentals') return '/rentals/login';
  return '/pro/login';
};

export default function PortalTopNav({
  isLoggedIn,
  portalType = 'pro',
  onSignOut,
  userEmail = '',
  className = '',
  loggedInLinks,
}) {
  const portalLoginHref = getPortalLogin(portalType);
  const portalHomeHref = getPortalBase(portalType);
  const normalizedType = normalizePortalType(portalType);
  const marketingLinks =
    normalizedType === 'venue'
      ? venueMarketingLinks
      : normalizedType === 'rentals'
      ? rentalsMarketingLinks
      : proMarketingLinks;
  const startTrialHref = normalizedType === 'rentals' ? '/rentals/signup' : '/venues/checkout';
  if (isLoggedIn) {
    const portalLinks =
      loggedInLinks ||
      (normalizedType === 'rentals'
        ? [
            { href: portalHomeHref, label: 'Portal' },
            { href: `${portalHomeHref}#properties`, label: 'Properties' },
            { href: `${portalHomeHref}#branding`, label: 'Branding' },
            { href: `${portalHomeHref}#share-tools`, label: 'Share tools' },
          ]
        : [
            { href: portalHomeHref, label: 'Portal' },
            {
              href: `${portalHomeHref}#venues`,
              label: 'My venues',
              hidden: normalizedType !== 'venue',
            },
            { href: `${portalHomeHref}#billing`, label: 'My account' },
          ]);

    return (
      <header
        className={`sticky top-0 z-40 border-b border-slate-800/40 bg-slate-900/95 text-white backdrop-blur ${className}`}
      >
        <div className="mx-auto flex flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:py-4">
          <Link href={portalHomeHref} className="flex items-center gap-3">
            <Image
              src="/images/set-the-date-pro.png"
              alt="Set The Date Pro"
              width={140}
              height={40}
              className="h-8 w-auto"
              priority={false}
            />
            <span className="text-sm font-semibold uppercase tracking-[0.35em] text-white/80">
              Portal
            </span>
          </Link>

          <nav className="flex flex-wrap gap-4 text-sm font-semibold">
            {portalLinks
              .filter((item) => !item.hidden)
              .map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-full border border-transparent px-3 py-1 text-white/80 transition hover:border-white/60 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
          </nav>

          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
            {userEmail && (
              <span className="text-xs uppercase tracking-[0.35em] text-white/60">
                {userEmail}
              </span>
            )}
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-slate-900"
              >
                Log out
              </button>
            )}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      className={`sticky top-0 z-40 border-b border-white/60 bg-white/95 text-slate-900 backdrop-blur ${className}`}
    >
      <div className="mx-auto px-4 py-3 sm:px-6 lg:max-w-6xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/images/setthedate-logo.png"
                alt="Set The Date"
                width={140}
                height={40}
                className="h-8 w-auto"
                priority={false}
              />
              <span className="text-base font-semibold text-slate-900">Set The Date</span>
            </Link>
            <div className="flex items-center gap-2 md:hidden">
              <Link
                href={portalLoginHref}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                Portal login
              </Link>
              <Link
                href={startTrialHref}
                className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
              >
                Start free trial
              </Link>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-4 text-sm font-semibold text-slate-700">
            {marketingLinks.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-slate-900">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              href={portalLoginHref}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
            >
              Portal login
            </Link>
            <Link
              href={startTrialHref}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-900/20 transition hover:bg-slate-800"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
