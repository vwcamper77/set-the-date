import '../styles/globals.css';
import { Component, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Script from 'next/script';
import IosOrganizerNav from '@/components/IosOrganizerNav';
import * as gtag from '../lib/gtag';
import { useIsIosCapacitorApp } from '../lib/capacitorRuntime';
import { Analytics } from '@vercel/analytics/react';

class IosReactErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    if (this.props.isNativeIosApp) {
      console.error(
        '[ios-react-error]',
        error?.message,
        error?.stack,
        errorInfo?.componentStack
      );
    }
  }

  render() {
    if (this.state.hasError && this.props.isNativeIosApp) {
      return (
        <div className="min-h-screen bg-white px-6 py-10 text-center text-slate-900">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-3 text-sm text-slate-600">
            Please close and reopen the app, then try again.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent');
    if (consent) return;

    fetch('https://ipapi.co/json')
      .then((res) => res.json())
      .then((data) => {
        const euCountries = [
          'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE',
          'IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS',
          'LI','NO','CH','GB'
        ];
        if (euCountries.includes(data.country)) {
          setVisible(true);
          if (window.gtag) {
            window.gtag('consent', 'default', {
              ad_storage: 'denied',
              analytics_storage: 'denied'
            });
          }
        }
      })
      .catch((err) => {
        console.warn('Geo check failed', err);
      });
  }, []);

  const accept = () => {
    localStorage.setItem('cookie_consent', 'granted');
    setVisible(false);
    if (window.gtag) {
      window.gtag('consent', 'update', {
        ad_storage: 'granted',
        analytics_storage: 'granted'
      });
    }
  };

  const reject = () => {
    localStorage.setItem('cookie_consent', 'denied');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 p-4 text-sm shadow-lg z-50 flex flex-col md:flex-row items-center justify-between gap-4">
      <div>
        🍪 We use cookies to improve your experience. You can accept or reject analytics & ad tracking.
      </div>
      <div className="flex gap-2">
        <button onClick={accept} className="bg-black text-white px-3 py-1 rounded hover:bg-gray-800">
          Accept
        </button>
        <button onClick={reject} className="border px-3 py-1 rounded hover:bg-gray-100">
          Reject
        </button>
      </div>
    </div>
  );
}

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const showPromoFooter = Component?.showPromoFooter !== false;
  const isNativeIosApp = useIsIosCapacitorApp();
  const contentPaddingBottom = isNativeIosApp ? 'pb-[calc(env(safe-area-inset-bottom)+110px)]' : '';

  useEffect(() => {
    const handleRouteChange = (url) => {
      gtag.pageview(url);
    };
    router.events.on('routeChangeComplete', handleRouteChange);

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const utm_source = urlParams.get('utm_source');
      const referrer = document.referrer;

      const entrySource =
        utm_source ||
        (referrer.includes('setthedate.app') ? 'Homepage' :
        referrer ? new URL(referrer).hostname : 'Direct');

      if (!sessionStorage.getItem('entrySource')) {
        sessionStorage.setItem('entrySource', entrySource);
      }
    }

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events]);

  useEffect(() => {
    if (!isNativeIosApp || typeof window === 'undefined') return undefined;

    const handleClientError = (event) => {
      console.error('[ios-client-error]', event?.error || event?.message || event);
    };

    const handleUnhandledRejection = (event) => {
      console.error('[ios-client-error]', event?.reason || event);
    };

    window.addEventListener('error', handleClientError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleClientError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [isNativeIosApp]);

  return (
    <>
      {/* ✅ Meta Pixel */}
      <Script id="facebook-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '1216204896541990');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src="https://www.facebook.com/tr?id=1216204896541990&ev=PageView&noscript=1"
        />
      </noscript>

      {/* ✅ Google Analytics */}
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID}`}
      />
      <Script
        id="gtag-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID}', {
              page_path: window.location.pathname,
            });
          `,
        }}
      />

      <IosReactErrorBoundary isNativeIosApp={isNativeIosApp}>
        <div className="font-sans text-foreground bg-white min-h-screen flex flex-col">
          <main className="flex-1">
            <div className={contentPaddingBottom}>
              <Component {...pageProps} />
            </div>
          </main>
          {showPromoFooter && !isNativeIosApp && (
            <div className="border-t border-gray-200 px-4 py-4 text-center text-sm text-gray-600">
              Free advertising space for venues or restaurants that need bookings:
              <a
                href="https://plan.setthedate.app/venues"
                target="_blank"
                rel="noreferrer"
                className="ml-1 font-semibold text-blue-600 hover:underline"
              >
                Claim it here
              </a>
            </div>
          )}
        </div>
      </IosReactErrorBoundary>

      {isNativeIosApp && <IosOrganizerNav />}

      {!isNativeIosApp && <ConsentBanner />}
      <Analytics />
    </>
  );
}

export default MyApp;
