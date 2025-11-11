import Image from 'next/image';
import Link from 'next/link';

const NAV_LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/partners/start#how-it-works', label: 'Why venues' },
  { href: '/partners/start#partner-signup-form', label: 'Sign up' },
];

const VARIANT_STYLES = {
  solid: 'border-slate-200 bg-white/95 backdrop-blur',
  translucent: 'border-white/50 bg-white/80 backdrop-blur',
};

export default function PartnerNav({ variant = 'solid', containerClassName = 'max-w-6xl' }) {
  const headerClass = VARIANT_STYLES[variant] || VARIANT_STYLES.solid;

  return (
    <header className={`sticky top-0 z-40 border-b ${headerClass}`}>
      <div className={`mx-auto ${containerClassName} px-4 py-3 sm:px-6`}>
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/images/setthedate-logo.png"
              alt="Set The Date"
              width={140}
              height={40}
              className="h-8 w-auto"
              priority={false}
            />
            <span className="text-base font-semibold text-slate-900">Set The Date</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-700 md:flex">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="transition hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/partners/checkout"
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-900/20 transition hover:bg-slate-800"
          >
            Start free trial
          </Link>
        </div>

        <nav className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-700 md:hidden">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="underline-offset-2 hover:underline"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
