// components/LogoHeader.js
'use client';

export default function LogoHeader({
  isPro = false,
  compact = false,
  className = '',
  imageClassName = '',
}) {
  const src = isPro ? '/images/set-the-date-pro.png' : '/images/setthedate-logo-small.png';
  const alt = isPro ? 'Set The Date Pro logo' : 'Set The Date logo';

  return (
    <div className={`text-center ${compact ? 'mb-4' : 'mb-6'} ${className}`}>
      <a href="https://setthedate.app" aria-label="Go to Set The Date homepage">
        {src ? (
          <img
            src={src}
            alt={alt}
            width={320}
            height={220}
            className={`mx-auto h-auto w-40 transition-transform duration-300 hover:scale-105 sm:w-48 md:w-56 ${imageClassName}`}
          />
        ) : null}
      </a>
    </div>
  );
}
