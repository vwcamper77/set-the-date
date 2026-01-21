import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import PortalTopNav from './PortalTopNav';
import { auth, db } from '@/lib/firebase';

export default function RentalsNav() {
  const [user, setUser] = useState(() => auth?.currentUser || null);
  const [ownerProfile, setOwnerProfile] = useState(null);
  const [loadingOwner, setLoadingOwner] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (cancelled) return;
      setUser(firebaseUser);

      if (!firebaseUser) {
        setOwnerProfile(null);
        setLoadingOwner(false);
        return;
      }

      const loadOwner = async () => {
        setLoadingOwner(true);
        try {
          const ownerRef = doc(db, 'rentalsOwners', firebaseUser.uid);
          const snapshot = await getDoc(ownerRef);
          if (cancelled) return;
          if (snapshot.exists()) {
            setOwnerProfile({ id: snapshot.id, ...snapshot.data() });
          } else {
            setOwnerProfile(null);
          }
        } catch (error) {
          console.error('rentals nav owner load failed', error);
          if (!cancelled) {
            setOwnerProfile(null);
          }
        } finally {
          if (!cancelled) {
            setLoadingOwner(false);
          }
        }
      };

      loadOwner();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const isOwner = Boolean(ownerProfile);
  const isLoggedIn = Boolean(user && isOwner && !loadingOwner);

  const loggedInLinks = useMemo(
    () => [
      { href: '/rentals/portal', label: 'Portal' },
      { href: '/rentals/portal#properties', label: 'Properties' },
      { href: '/rentals/portal#branding', label: 'Branding' },
    ],
    []
  );

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('rentals nav sign out failed', error);
    }
  };

  return (
    <PortalTopNav
      isLoggedIn={isLoggedIn}
      portalType="rentals"
      userEmail={isOwner ? user?.email || ownerProfile?.email || '' : ''}
      onSignOut={isLoggedIn ? handleSignOut : undefined}
      loggedInLinks={loggedInLinks}
    />
  );
}
