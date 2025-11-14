// components/LogoHeader.js
import Image from 'next/image';

export default function LogoHeader({ isPro = false, compact = false }) {
  const src = isPro ? '/images/set-the-date-pro.png' : '/images/setthedate-logo-small.png';
  const alt = isPro ? 'Set The Date Pro logo' : 'Set The Date logo';

  return (
    <div className={`text-center ${compact ? 'mb-4' : 'mb-6'}`}>
      <a href="https://setthedate.app" aria-label="Go to Set The Date homepage">
        <Image
          src={src}
          alt={alt}
          width={320}
          height={220}
          className="mx-auto h-auto w-40 sm:w-48 md:w-56 transition-transform duration-300 hover:scale-105"
          sizes="(min-width: 768px) 14rem, (min-width: 640px) 12rem, 10rem"
          priority={false}
        />
      </a>
    </div>
  );
}
