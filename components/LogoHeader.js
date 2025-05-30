// components/LogoHeader.js

export default function LogoHeader() {
  return (
    <div className="text-center mb-6">
      <a href="https://setthedate.app" aria-label="Go to Set The Date homepage">
        <img
          src="/images/setthedate-logo.png"
          alt="Set The Date – Logo"
          className="!h-40 sm:!h-48 md:!h-56 mx-auto transition-transform duration-300 hover:scale-105"
        />
      </a>
    </div>
  );
}
