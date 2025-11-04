export default function UpgradeModal({
  open,
  onClose,
  onUpgrade,
  onEmailChange,
  emailValue = '',
  emailError = '',
  upgrading = false,
  title = 'Unlock unlimited dates + hosted page',
  description = 'Pay once to unlock unlimited date options and get a hosted page to share with your group.',
  ctaLabel = 'Unlock for $3 one-time',
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src="/images/set-the-date-pro.png"
            alt="Set The Date Pro"
            className="h-20 w-20 rounded-2xl object-cover"
          />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-600">{description}</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
          <p className="font-semibold uppercase tracking-wide text-gray-500">What you get</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Hosted event page that’s ready to share instantly.</li>
            <li>Unlimited date options (no more 3-date cap for regular events).</li>
            <li>Breakfast slots + per-date meal controls.</li>
            <li>Plan trip windows longer than 10 days.</li>
            <li>Apple Pay, Google Pay, and cards handled securely by Stripe.</li>
            <li>One-time $3 payment. No subscription to cancel.</li>
          </ul>
          <p className="mt-3 text-xs text-gray-500">
            After checkout you’ll jump straight back to your event with every field exactly where you left it.
          </p>
        </div>

        <div className="mt-5">
          <label className="text-xs font-semibold text-gray-700" htmlFor="upgrade-email">
            Organiser email (for your receipt + unlock link)
          </label>
          <input
            id="upgrade-email"
            type="email"
            value={emailValue}
            onChange={(e) => onEmailChange?.(e.target.value)}
            placeholder="jamie@example.com"
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              emailError
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
            }`}
            autoComplete="email"
          />
          {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
          <p className="mt-1 text-xs text-gray-500">
            We’ll send the unlock link and receipt here immediately after checkout.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            onClick={onClose}
            disabled={upgrading}
          >
            Maybe later
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            onClick={onUpgrade}
            disabled={upgrading}
          >
            {upgrading ? 'Opening checkout...' : ctaLabel}
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-gray-500">
          Secure checkout powered by Stripe.
        </p>
      </div>
    </div>
  );
}
