import { useEffect, useState } from 'react';

export const IOS_PRO_UPGRADE_MESSAGE =
  'Set The Date Pro is coming to the iPhone app. If you already have Pro, use the same organiser email to unlock it.';
export const IOS_PRO_BILLING_MESSAGE =
  'Billing management is not available in the iPhone app yet. Use the web browser version to manage your subscription.';

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

export function getProRuntimeCapabilities() {
  const isNativeIosApp = isIosCapacitorApp();

  return {
    isNativeIosApp,
    allowsProCheckout: !isNativeIosApp,
    allowsProBillingPortal: !isNativeIosApp,
    upgradeMessage: isNativeIosApp ? IOS_PRO_UPGRADE_MESSAGE : '',
    billingMessage: isNativeIosApp ? IOS_PRO_BILLING_MESSAGE : '',
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
  };
}
