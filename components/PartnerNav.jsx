import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import PortalTopNav from './PortalTopNav';
import { auth, db } from '@/lib/firebase';

/**
 * Marketing pages reuse this nav. Logged-out users get the CTA layout,
 * while authenticated users see the portal shortcuts and log-out button.
 */
export default function PartnerNav({ defaultPortalType = 'venue' }) {
  const [user, setUser] = useState(() => auth?.currentUser || null);
  const [portalType, setPortalType] = useState(defaultPortalType);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (cancelled) return;
      setUser(firebaseUser);

      if (!firebaseUser) {
        setPortalType(defaultPortalType);
        return;
      }

      const loadProfile = async () => {
        try {
          const profileRef = doc(db, 'portalUsers', firebaseUser.uid);
          const snapshot = await getDoc(profileRef);
          if (!cancelled) {
            const type = snapshot.exists() ? snapshot.data()?.type : defaultPortalType;
            setPortalType(type || defaultPortalType);
          }
        } catch (error) {
          console.error('partner nav profile load failed', error);
          if (!cancelled) {
            setPortalType(defaultPortalType);
          }
        }
      };

      loadProfile();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [defaultPortalType]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('partner nav sign out failed', error);
    }
  };

  const loggedInLinks = useMemo(() => {
    const base = portalType === 'venue' ? '/venues/portal' : '/pro/portal';
    return [
      { href: base, label: 'Portal' },
      { href: `${base}#venues`, label: 'My venues', hidden: portalType !== 'venue' },
      { href: `${base}#billing`, label: 'My account' },
    ];
  }, [portalType]);

  return (
    <PortalTopNav
      isLoggedIn={Boolean(user)}
      portalType={portalType}
      userEmail={user?.email || ''}
      onSignOut={user ? handleSignOut : undefined}
      loggedInLinks={loggedInLinks}
    />
  );
}
