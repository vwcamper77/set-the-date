// lib/logEventIfAvailable.js

export async function logEventIfAvailable(eventName, eventParams = {}) {
    if (typeof window === 'undefined') return;
  
    try {
      const { getAnalytics, isSupported, logEvent } = await import('firebase/analytics');
      const { initializeApp } = await import('firebase/app');
  
      const app = initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
      });
  
      const supported = await isSupported();
      if (!supported) return;
  
      const analytics = getAnalytics(app);
      logEvent(analytics, eventName, eventParams);
    } catch (err) {
      console.warn('⚠️ Analytics failed:', err.message);
    }
  }
  