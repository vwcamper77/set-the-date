const BASE_CLASSES =
  'inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white/95 px-6 py-3 text-base font-semibold text-slate-600 shadow-sm shadow-slate-900/5';

export default function PoweredByBadge({ label = 'Set The Date', className = '', logoAlt }) {
  const mergedClassName = className ? `${BASE_CLASSES} ${className}` : BASE_CLASSES;
  const altText = logoAlt || label;

  return (
    <div className={mergedClassName}>
      <img
        src="/images/setthedate-logo.png"
        alt={altText}
        className="h-10 w-10 rounded-xl border border-slate-200"
        loading="lazy"
      />
      <span>Powered by {label}</span>
    </div>
  );
}
