import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../models/types';
import { onAuthStateChanged, signOut as firebaseSignOut, getCurrentUser } from '../services/FirebaseConfig';
import { syncUserProfile } from '../services/SyncService';

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

    // Sync profile to Firestore so other users can find this user by phone
    try {
      await syncUserProfile(uid, phone, localUser.displayName);
    } catch {
      // Non-critical - will sync later
    }
  }, []);

  const signOutUser = useCallback(async () => {
    try {
      await firebaseSignOut();
    } catch {
      // Ignore sign out errors
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

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

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAuthenticated,
      signIn,
      signOut: signOutUser,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
