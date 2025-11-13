const BASE_CLASSES =
  'inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white/95 px-6 py-3 text-base font-semibold text-slate-600 shadow-sm shadow-slate-900/5';

export default function PoweredByBadge({
  label = 'Set The Date',
  className = '',
  logoAlt,
  href,
  target = '_blank',
  rel = 'noopener noreferrer',
  ariaLabel,
}) {
  const mergedClassName = className ? `${BASE_CLASSES} ${className}` : BASE_CLASSES;
  const altText = logoAlt || label;
  const badgeContents = (
    <>
      <img
        src="/images/setthedate-logo.png"
        alt={altText}
        className="h-10 w-10 rounded-xl border border-slate-200"
        loading="lazy"
      />
      <span>Powered by {label}</span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        className={mergedClassName}
        aria-label={ariaLabel || `Visit ${label}`}
      >
        {badgeContents}
      </a>
    );
  }

  return <div className={mergedClassName}>{badgeContents}</div>;
}
