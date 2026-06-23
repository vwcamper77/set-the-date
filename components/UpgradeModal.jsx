import { DEFAULT_FREE_DATE_LIMIT, getDefaultDateLimitCopy } from '@/lib/gatingDefaults';

export default function UpgradeModal({
  open,
  onClose,
  onUpgrade,
  onEmailChange,
  emailValue = '',
  emailError = '',
  upgrading = false,
  title = 'Unlock unlimited dates + hosted page',
  description = 'Subscribe for $2.99 to unlock unlimited date options, hosted pages, and organiser perks for 3 months.',
  ctaLabel = 'Unlock for $2.99 / 3 months',
  dateLimitCopy = getDefaultDateLimitCopy(DEFAULT_FREE_DATE_LIMIT),
  checkoutEnabled = true,
  disabledMessage = '',
  closeLabel = 'Maybe later',
  disabledPrimaryLabel = '',
  onDisabledPrimaryAction,
  disabledSecondaryLabel = '',
  onDisabledSecondaryAction,
  featureList,
  emailLabel = 'Organiser email (for your receipt + unlock link)',
  helperText,
}) {
  if (!open) return null;

  const resolvedFeatureList = featureList || [
    "Hosted event page that's ready to share instantly.",
    dateLimitCopy,
    'Breakfast slots + per-date meal controls.',
    ...(checkoutEnabled ? ['Apple Pay, Google Pay, and cards handled securely by Stripe.'] : []),
    '$2.99 subscription billed every 3 months. Cancel anytime.',
  ];
  const resolvedHelperText =
    helperText ||
    (checkoutEnabled
      ? "We'll send the unlock link and receipt here immediately after checkout."
      : 'Already Pro? Use the same organiser email to unlock Pro features.');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 sm:p-6">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:max-w-md sm:p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src="/images/set-the-date-pro.png"
            alt="Set The Date Pro"
            className="h-16 w-16 rounded-2xl object-cover sm:h-20 sm:w-20"
          />
          <div>
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{title}</h2>
            <p className="mt-1 text-sm text-gray-600 sm:text-base">{description}</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700 sm:text-base">
          <p className="font-semibold uppercase tracking-wide text-gray-500">What you get</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {resolvedFeatureList.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          {checkoutEnabled ? (
            <p className="mt-3 text-xs text-gray-500">
              After checkout you'll jump straight back to your event with every field exactly where you left it.
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          <label className="text-xs font-semibold text-gray-700" htmlFor="upgrade-email">
            {emailLabel}
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
          <p className="mt-1 text-xs text-gray-500">{resolvedHelperText}</p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {checkoutEnabled ? (
            <>
              <button
                type="button"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 sm:w-auto"
                onClick={onClose}
                disabled={upgrading}
              >
                {closeLabel}
              </button>
              <button
                type="button"
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 sm:w-auto"
                onClick={onUpgrade}
                disabled={upgrading}
              >
                {upgrading ? 'Opening checkout...' : ctaLabel}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 sm:w-auto"
                onClick={onDisabledSecondaryAction || onClose}
              >
                {disabledSecondaryLabel || closeLabel}
              </button>
              <button
                type="button"
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
                onClick={onDisabledPrimaryAction || onClose}
              >
                {disabledPrimaryLabel || 'Continue'}
              </button>
            </>
          )}
        </div>

        {!checkoutEnabled && disabledMessage ? (
          <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {disabledMessage}
          </p>
        ) : null}

        {checkoutEnabled ? (
          <p className="mt-3 text-center text-xs text-gray-500">
            Secure checkout powered by Stripe.
          </p>
        ) : null}
      </div>
    </div>
  );
}
