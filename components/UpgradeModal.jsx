export default function UpgradeModal({
  open,
  onClose,
  onUpgrade,
  upgrading = false,
  title = 'Unlock Set The Date Pro',
  description = "You've reached the limit for free events. Upgrade once for £5 to unlock unlimited dates and meal options.",
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        <p className="mt-3 text-sm text-gray-600">{description}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            onClick={onClose}
            disabled={upgrading}
          >
            Maybe later
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            onClick={onUpgrade}
            disabled={upgrading}
          >
            {upgrading ? 'Opening checkout…' : 'Upgrade for £5'}
          </button>
        </div>
      </div>
    </div>
  );
}

