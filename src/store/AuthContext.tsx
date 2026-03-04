import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { User } from '../models/types';
import { getUserProfile, updateUserProfile, DEV_MOCK_FIREBASE, MOCK_USER_ID } from '../services/FirebaseService';

interface AuthState {
  user: User | null;
  firebaseUser: FirebaseAuthTypes.User | null;
  loading: boolean;
  // Called after OTP is verified and name is collected
  onOtpVerified: (uid: string, displayName: string, phone: string) => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  firebaseUser: null,
  loading: true,
  onOtpVerified: async () => {},
  updateProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen for Firebase auth state changes
  useEffect(() => {
    if (DEV_MOCK_FIREBASE) {
      // In mock mode, auto-login with mock user — no real Firebase needed
      getUserProfile(MOCK_USER_ID).then(profile => {
        setUser(profile);
        setLoading(false);
      });
      return;
    }

    const unsubscribe = auth().onAuthStateChanged(async fbUser => {
      setFirebaseUser(fbUser);
      if (fbUser && !fbUser.isAnonymous) {
        const profile = await getUserProfile(fbUser.uid);
        setUser(profile);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  /**
   * Called after OTP is verified. Saves the user profile and marks them as logged in.
   */
  const onOtpVerified = async (uid: string, displayName: string, phone: string) => {
    setLoading(true);
    try {
      const existing = await getUserProfile(uid);
      if (!existing) {
        await updateUserProfile(uid, {
          id: uid,
          displayName,
          phone,
          createdAt: Date.now(),
        });
      } else if (!existing.displayName || existing.displayName === 'User') {
        await updateUserProfile(uid, { displayName, phone });
      }
      const profile = await getUserProfile(uid);
      setUser(profile);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    if (!firebaseUser) return;
    await updateUserProfile(firebaseUser.uid, data);
    const updated = await getUserProfile(firebaseUser.uid);
    setUser(updated);
  };

  const signOut = async () => {
    if (!DEV_MOCK_FIREBASE) {
      await auth().signOut();
    }
    setUser(null);
    setFirebaseUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, onOtpVerified, updateProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
