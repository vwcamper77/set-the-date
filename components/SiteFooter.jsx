import { FAMILY_FOOTER_SIBLINGS, FAMILY_SITES } from '@/lib/familySites';
import { logEventIfAvailable } from '@/lib/logEventIfAvailable';

const trackFamilyLink = (destination) => {
  logEventIfAvailable('family_footer_click', {
    source_product: 'setthedate',
    destination,
    placement: 'footer',
  });
};

export default function SiteFooter() {
  const parent = FAMILY_SITES.gmbfVentures;

  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="leading-6">
            SetTheDate is a product of{' '}
            <a
              href={parent.url}
              onClick={() => trackFamilyLink(parent.analyticsDestination)}
              className="font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 transition hover:text-blue-700 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              GMBF Ventures Ltd
            </a>
            .
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Also from GMBF Ventures
            </span>
            {FAMILY_FOOTER_SIBLINGS.map((site) => (
              <a
                key={site.analyticsDestination}
                href={site.url}
                onClick={() => trackFamilyLink(site.analyticsDestination)}
                className="font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 transition hover:text-blue-700 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {site.name}
              </a>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Free advertising space for venues or restaurants that need bookings:{' '}
            <a
              href={`${FAMILY_SITES.setTheDate.url}venues`}
              className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-800 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Claim it here
            </a>
          </p>
        </div>

        <a
          href={parent.url}
          onClick={() => trackFamilyLink(parent.analyticsDestination)}
          aria-label="Visit GMBF Ventures Ltd"
          className="w-fit shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
        >
          <img
            src="/brand/gmbf/gmbf-logo-horizontal-dark.svg"
            alt="GMBF Ventures"
            width="820"
            height="320"
            className="h-auto w-[180px]"
          />
        </a>
      </div>
    </footer>
  );
}
