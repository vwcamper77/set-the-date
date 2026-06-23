import { useEffect, useState } from 'react';

export const IOS_PRO_UPGRADE_MESSAGE =
  'This organiser email is on the free plan. You can continue with the free limits, or upgrade from the web version of Set The Date.';
export const IOS_PRO_BILLING_MESSAGE =
  'Billing management is not available in the iPhone app yet. Use the web browser version to manage your subscription.';
export const IOS_PRO_MODAL_COPY = {
  title: 'Unlock Pro features',
  description:
    'Unlimited dates and hosted event pages are Pro features. You can continue with the free plan for now, or upgrade from the web version of Set The Date.',
  features: [
    'Hosted event page ready to share',
    'Unlimited date options',
    'Breakfast slots and meal controls',
    'Already Pro? Use the same organiser email to unlock Pro features.',
  ],
  emailLabel: 'Organiser email',
  helperText: 'Already Pro? Use the same organiser email to unlock Pro features.',
};

export function isIosCapacitorApp() {
  if (typeof window === 'undefined') return false;

  const capacitor = window.Capacitor;
  const isNativePlatform =
    typeof capacitor?.isNativePlatform === 'function'
      ? capacitor.isNativePlatform()
      : false;

  if (!isNativePlatform) return false;

  if (typeof capacitor?.getPlatform === 'function') {
    return capacitor.getPlatform() === 'ios';
  }

  return /iPad|iPhone|iPod/.test(window.navigator?.userAgent || '');
}

const DEFAULT_SET_THE_DATE_ORIGIN = 'https://plan.setthedate.app';

const getBaseOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  const configuredOrigin =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    DEFAULT_SET_THE_DATE_ORIGIN;

  try {
    return new URL(configuredOrigin).origin;
  } catch {
    return DEFAULT_SET_THE_DATE_ORIGIN;
  }
};

const getKnownHosts = () => {
  const hosts = new Set(['plan.setthedate.app', 'www.plan.setthedate.app']);

  try {
    hosts.add(new URL(getBaseOrigin()).host);
  } catch {}

  if (typeof window !== 'undefined' && window.location?.host) {
    hosts.add(window.location.host);
  }

  return hosts;
};

const hasRouterMethod = (router, methodName) =>
  Boolean(router && typeof router[methodName] === 'function');

export function isInternalSetTheDateUrl(url) {
  if (!url || typeof url !== 'string') return false;

  try {
    const parsed = new URL(url, getBaseOrigin());
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return getKnownHosts().has(parsed.host);
  } catch (error) {
    console.error('[iOS internal navigation]', error);
    return false;
  }
}

export function toInternalPath(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    const parsed = new URL(url, getBaseOrigin());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!getKnownHosts().has(parsed.host)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (error) {
    console.error('[iOS internal navigation]', error);
    return null;
  }
}

export function navigateInternalOrExternal({
  url,
  router,
  isNativeIosApp = false,
  target = '_self',
  replace = false,
} = {}) {
  if (!url || typeof url !== 'string') return false;

  const internalPath = toInternalPath(url);

  if (isNativeIosApp && internalPath) {
    try {
      const methodName = replace ? 'replace' : 'push';
      if (hasRouterMethod(router, methodName)) {
        router[methodName](internalPath);
        return true;
      }
    } catch (error) {
      console.error('[iOS internal navigation]', error);
    }
  }

  if (typeof window === 'undefined') return false;

  try {
    if (internalPath) {
      if (replace) {
        window.location.href = internalPath;
      } else {
        window.location.href = internalPath;
      }
      return false;
    }

    if (target === '_blank') {
      window.open(url, '_blank');
      return false;
    }

    if (replace) {
      window.location.replace(url);
    } else {
      window.location.assign(url);
    }
  } catch (error) {
    console.error('[iOS internal navigation]', error);
  }

  return false;
}

export function getProRuntimeCapabilities() {
  const isNativeIosApp = isIosCapacitorApp();

  return {
    isNativeIosApp,
    allowsProCheckout: !isNativeIosApp,
    allowsProBillingPortal: !isNativeIosApp,
    upgradeMessage: isNativeIosApp ? IOS_PRO_UPGRADE_MESSAGE : '',
    billingMessage: isNativeIosApp ? IOS_PRO_BILLING_MESSAGE : '',
    modalCopy: isNativeIosApp ? IOS_PRO_MODAL_COPY : null,
  };
}

export function useIsIosCapacitorApp() {
  const [isNativeIosApp, setIsNativeIosApp] = useState(false);

  useEffect(() => {
    setIsNativeIosApp(isIosCapacitorApp());
  }, []);

  return isNativeIosApp;
}

export function useProRuntimeCapabilities() {
  const isNativeIosApp = useIsIosCapacitorApp();

  return {
    isNativeIosApp,
    allowsProCheckout: !isNativeIosApp,
    allowsProBillingPortal: !isNativeIosApp,
    upgradeMessage: isNativeIosApp ? IOS_PRO_UPGRADE_MESSAGE : '',
    billingMessage: isNativeIosApp ? IOS_PRO_BILLING_MESSAGE : '',
    modalCopy: isNativeIosApp ? IOS_PRO_MODAL_COPY : null,
  };
}
