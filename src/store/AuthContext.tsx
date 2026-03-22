import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../models/types';
import { onAuthStateChanged, signOut as firebaseSignOut, getCurrentUser } from '../services/FirebaseConfig';
import { syncUserProfile } from '../services/SyncService';
import {
  requestNotificationPermission as requestFcmPermission,
  registerDeviceToken, unregisterDeviceToken, onTokenRefresh,
} from '../services/FcmService';
import { clearReminderState } from '../services/DebtReminderService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (uid: string, phone: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (displayName: string, phone: string) => Promise<void>;
}

const STORAGE_KEY = '@et_user';

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  signIn: async () => {},
  signOut: async () => {},
  updateProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const tokenRefreshUnsub = useRef<(() => void) | null>(null);

  // Register FCM token when user is authenticated
  const setupFcm = useCallback(async (uid: string) => {
    try {
      await requestFcmPermission();
      await registerDeviceToken(uid);
      // Listen for token refreshes
      if (tokenRefreshUnsub.current) tokenRefreshUnsub.current();
      tokenRefreshUnsub.current = onTokenRefresh(uid);
    } catch {
      // FCM setup is best-effort — may fail in emulator
    }
  }, []);

  // Check for existing auth session on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in via Firebase - load local profile
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const localUser = JSON.parse(raw) as User;
          // Ensure the local user matches the Firebase UID
          if (localUser.id === firebaseUser.uid) {
            setUser(localUser);
            setIsAuthenticated(true);
            setupFcm(localUser.id);
          } else {
            // Mismatch - create new local profile for this Firebase user
            const newUser: User = {
              id: firebaseUser.uid,
              displayName: localUser.displayName || 'User',
              phone: firebaseUser.phoneNumber?.replace('+91', '') || '',
              createdAt: Date.now(),
            };
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
            setUser(newUser);
            setIsAuthenticated(true);
            setupFcm(newUser.id);
          }
        } else {
          // No local profile yet - create one from Firebase user
          const newUser: User = {
            id: firebaseUser.uid,
            displayName: 'User',
            phone: firebaseUser.phoneNumber?.replace('+91', '') || '',
            createdAt: Date.now(),
          };
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
          setUser(newUser);
          setIsAuthenticated(true);
          setupFcm(newUser.id);
        }
      } else {
        // Not signed in
        setUser(null);
        setIsAuthenticated(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Called after successful OTP verification
  const signIn = useCallback(async (uid: string, phone: string) => {
    const existingRaw = await AsyncStorage.getItem(STORAGE_KEY);
    let localUser: User;

    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as User;
      localUser = {
        ...existing,
        id: uid,
        phone,
      };
    } else {
      localUser = {
        id: uid,
        displayName: 'User',
        phone,
        createdAt: Date.now(),
      };
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localUser));
    setUser(localUser);
    setIsAuthenticated(true);

    // Register FCM device token
    setupFcm(uid);

    // Sync profile to Firestore so other users can find this user by phone
    try {
      await syncUserProfile(uid, phone, localUser.displayName);
    } catch {
      // Non-critical - will sync later
    }
  }, []);

  const signOutUser = useCallback(async () => {
    // Unregister FCM token before sign out
    if (user?.id) {
      try {
        await unregisterDeviceToken(user.id);
      } catch {
        // Best-effort cleanup
      }
    }
    if (tokenRefreshUnsub.current) {
      tokenRefreshUnsub.current();
      tokenRefreshUnsub.current = null;
    }
    try {
      await firebaseSignOut();
    } catch {
      // Ignore sign out errors
    }

    // Clean up persisted state so next user starts fresh
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem('@et_tracker_state');
    await AsyncStorage.removeItem('@et_pending_review');
    await AsyncStorage.removeItem('@et_pending_group_split');
    await AsyncStorage.removeItem('@et_pending_choose_tracker');
    await clearReminderState();

    setUser(null);
    setIsAuthenticated(false);
  }, [user?.id]);

  const updateProfile = useCallback(async (displayName: string, phone: string) => {
    if (!user) return;
    const updated: User = { ...user, displayName, phone };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setUser(updated);

    // Sync to Firestore
    try {
      await syncUserProfile(user.id, phone, displayName);
    } catch {
      // Non-critical
    }
  }, [user]);

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated,
    signIn,
    signOut: signOutUser,
    updateProfile,
  }), [user, loading, isAuthenticated, signIn, signOutUser, updateProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
