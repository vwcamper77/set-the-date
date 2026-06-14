import { useEffect, useState } from 'react';

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

export function useIsIosCapacitorApp() {
  const [isNativeIosApp, setIsNativeIosApp] = useState(false);

  useEffect(() => {
    setIsNativeIosApp(isIosCapacitorApp());
  }, []);

  return isNativeIosApp;
}
