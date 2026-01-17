import Link from 'next/link';

export default function PortalMenu({
  mode,
  onModeChange,
  isLoggedIn,
  userEmail,
  portalType = 'pro',
}) {
  const portalBase = portalType === 'venue' ? '/venues/portal' : '/pro/portal';
  const loginDescription = isLoggedIn
    ? `Signed in as ${userEmail || 'your Set The Date account'}.`
    : portalType === 'venue'
    ? 'Returning venue partners sign in here.'
    : 'Returning organisers sign in here.';

  const registerCopy =
    portalType === 'venue'
      ? {
          label: 'Register',
          description: 'Create your venue partner login to manage venues and billing.',
        }
      : {
          label: 'Register',
          description: 'Create your organiser login to access the Pro dashboard.',
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
            </button>
            {item.id === 'login' && isLoggedIn && (
              <Link
                href={portalBase}
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
