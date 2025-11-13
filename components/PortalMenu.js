import Link from 'next/link';

export default function PortalMenu({
  mode,
  onModeChange,
  isLoggedIn,
  userEmail,
  selectedType,
}) {
  const loginDescription = isLoggedIn
    ? `Signed in as ${userEmail || 'your Set The Date account'}.`
    : 'Returning organisers or venues sign in here.';

  const registerCopy =
    selectedType === 'venue'
      ? {
          label: 'Register',
          description: 'Hotels and restaurants can request their partner login.',
        }
      : {
          label: 'Become a venue partner',
          description: 'Already on Set The Date Pro? Use this to onboard a venue profile.',
        };

  const menuItems = [
    {
      id: 'login',
      label: isLoggedIn ? 'Logged in' : 'Login',
      description: loginDescription,
    },
    {
      id: 'register',
      ...registerCopy,
    },
  ];

  return (
    <nav className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6" aria-label="Portal menu">
      {menuItems.map((item) => {
        const isActive = mode === item.id;
        return (
          <div key={item.id} className="space-y-2">
            <button
              type="button"
              onClick={() => onModeChange(item.id)}
              aria-pressed={isActive}
              className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                isActive
                  ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                  : 'border-slate-200 bg-white hover:border-slate-900'
              }`}
            >
              <span
                className={`block text-base font-semibold ${
                  isActive ? 'text-white' : 'text-slate-800'
                }`}
              >
                {item.label}
              </span>
              <span
                className={`mt-1 block text-xs leading-relaxed ${
                  isActive ? 'text-white' : 'text-slate-500'
                }`}
              >
                {item.description}
              </span>
              {item.id === 'register' && selectedType === 'pro' && (
                <span
                  className={`mt-3 inline-flex text-[11px] uppercase tracking-[0.35em] ${
                    isActive ? 'text-white' : 'text-slate-400'
                  }`}
                >
                  Venue access only
                </span>
              )}
            </button>
            {item.id === 'login' && isLoggedIn && (
              <Link
                href={`/portal?type=${selectedType}`}
                className="inline-flex text-xs font-semibold text-white underline-offset-2 rounded-full bg-slate-900 px-3 py-1"
              >
                Go to dashboard
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
