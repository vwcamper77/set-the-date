// components/LogoHeader.js

export default function LogoHeader({ isPro = false }) {
  const src = isPro ? '/images/set-the-date-pro.png' : '/images/setthedate-logo.png';
  const alt = isPro ? 'Set The Date Pro logo' : 'Set The Date logo';

  return (
    <div className="text-center mb-6">
      <a href="https://setthedate.app" aria-label="Go to Set The Date homepage">
        <img
          src={src}
          alt={alt}
          className="!h-40 sm:!h-48 md:!h-56 mx-auto transition-transform duration-300 hover:scale-105"
        />
      </a>
    </div>
  );
}
