import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useMemo, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group, GroupTransaction, Debt } from '../models/types';
import {
  createGroupCloud, getGroupsCloud,
  getGroupTransactionsCloud, settleSplitCloud, unsettleSplitCloud,
  onGroupTransactionsChanged,
  deleteGroupTransactionCloud, updateGroupTransactionCloud,
} from '../services/SyncService';
import {
  getGroups as getGroupsLocal, createGroup as createGroupLocal,
  getGroupTransactions as getGroupTransactionsLocal,
  settleSplit as settleSplitLocal,
  unsettleSplit as unsettleSplitLocal,
  deleteGroupTransaction as deleteGroupTransactionLocal,
  updateGroupTransaction as updateGroupTransactionLocal,
} from '../services/StorageService';
import { calculateDebts } from '../services/DebtCalculator';
import { useAuth } from './AuthContext';

// Cache keys for instant load
const CACHE_KEYS = {
  GROUPS: '@et_cache_groups',
  GROUP_TXNS: (id: string) => `@et_cache_gtxns_${id}`,
};

interface GroupContextType {
  groups: Group[];
  loading: boolean;
  refreshGroups: () => Promise<void>;
  createGroup: (name: string, members: Array<{ displayName: string; phone: string }>, userId: string, isTrip?: boolean, budget?: number) => Promise<Group>;
  activeGroupId: string | null;
  activeGroupTransactions: GroupTransaction[];
  activeGroupDebts: Debt[];
  loadGroupTransactions: (groupId: string) => Promise<void>;
  settleSplit: (groupId: string, transactionId: string, userId: string) => Promise<void>;
  unsettleSplit: (groupId: string, transactionId: string, userId: string) => Promise<void>;
  deleteGroupTransaction: (groupId: string, transactionId: string) => Promise<void>;
  updateGroupTransaction: (groupId: string, transactionId: string, updates: Partial<Pick<GroupTransaction, 'amount' | 'description' | 'merchant' | 'splits'>>) => Promise<void>;
}

const GroupContext = createContext<GroupContextType>({
  groups: [],
  loading: false,
  refreshGroups: async () => {},
  createGroup: async () => ({} as Group),
  activeGroupId: null,
  activeGroupTransactions: [],
  activeGroupDebts: [],
  loadGroupTransactions: async () => {},
  settleSplit: async () => {},
  unsettleSplit: async () => {},
  deleteGroupTransaction: async () => {},
  updateGroupTransaction: async () => {},
});

export function GroupProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeGroupTransactions, setActiveGroupTransactions] = useState<GroupTransaction[]>([]);
  const [activeGroupDebts, setActiveGroupDebts] = useState<Debt[]>([]);
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null);

  const refreshGroups = useCallback(async () => {
    if (!user) return;

    try {
      if (isAuthenticated) {
        // Fetch from Firestore - includes groups found by phone match
        const cloudGroups = await getGroupsCloud(user.id, user.phone);
        setGroups(cloudGroups);
        // Persist to cache for next instant load
        AsyncStorage.setItem(CACHE_KEYS.GROUPS, JSON.stringify(cloudGroups)).catch(() => {});
      } else {
        // Fallback to local storage
        const localGroups = await getGroupsLocal();
        setGroups(localGroups);
      }
    } catch {
      // Fallback to local
      const localGroups = await getGroupsLocal();
      setGroups(localGroups);
    }
  }, [user, isAuthenticated]);

  // Load cached groups instantly on mount, THEN refresh from cloud
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      // Step 1: Load from cache instantly (no spinner)
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEYS.GROUPS);
        if (cached && !cancelled) {
          const cachedGroups: Group[] = JSON.parse(cached);
          if (cachedGroups.length > 0) {
            setGroups(cachedGroups);
            setLoading(false); // User sees data immediately
          }
        }
      } catch {
        // Cache miss is fine, will fetch from cloud
      }

      // Step 2: Refresh from cloud silently in background
      if (!cancelled) {
        await refreshGroups();
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  const createGroup = useCallback(async (
    name: string,
    members: Array<{ displayName: string; phone: string }>,
    userId: string,
    isTrip?: boolean,
    budget?: number,
  ): Promise<Group> => {
    let group: Group;

    if (isAuthenticated && user) {
      // Create in Firestore (synced)
      group = await createGroupCloud(name, members, userId, user.phone, isTrip);
    } else {
      // Create locally (offline fallback)
      group = await createGroupLocal(name, members, userId, isTrip);
    }
    if (budget && budget > 0) {
      group.budget = budget;
    }

    setGroups(prev => {
      const updated = [group, ...prev];
      // Update cache
      AsyncStorage.setItem(CACHE_KEYS.GROUPS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    return group;
  }, [isAuthenticated, user]);

  const loadGroupTransactions = useCallback(async (groupId: string) => {
    // Cleanup previous listener
    if (unsubscribe) {
      unsubscribe();
      setUnsubscribe(null);
    }

    setActiveGroupId(groupId);

    // Step 1: Load cached transactions instantly
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEYS.GROUP_TXNS(groupId));
      if (cached) {
        const cachedTxns: GroupTransaction[] = JSON.parse(cached);
        if (cachedTxns.length > 0) {
          setActiveGroupTransactions(cachedTxns);
          setActiveGroupDebts(calculateDebts(cachedTxns));
        }
      }
    } catch {
      // Cache miss is fine
    }

    // Step 2: Set up real-time listener / fetch fresh data
    if (isAuthenticated) {
      // Set up real-time listener for group transactions
      // The listener fires immediately with current data, so no separate initial fetch needed
      // (doing both causes a race where the fetch overwrites newer listener data)
      const unsub = onGroupTransactionsChanged(groupId, (txns) => {
        setActiveGroupTransactions(txns);
        setActiveGroupDebts(calculateDebts(txns));
        // Update cache on every real-time update
        AsyncStorage.setItem(CACHE_KEYS.GROUP_TXNS(groupId), JSON.stringify(txns)).catch(() => {});
      });
      setUnsubscribe(() => unsub);
    } else {
      // Local fallback
      const txns = await getGroupTransactionsLocal(groupId);
      setActiveGroupTransactions(txns);
      setActiveGroupDebts(calculateDebts(txns));
    }
  }, [isAuthenticated, unsubscribe]);

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [unsubscribe]);

  const settleSplit = useCallback(async (
    groupId: string,
    transactionId: string,
    userId: string,
  ) => {
    if (isAuthenticated) {
      // Settle in Firestore (will trigger real-time update for all members)
      await settleSplitCloud(groupId, transactionId, userId);
    } else {
      // Local fallback
      await settleSplitLocal(groupId, transactionId, userId);
      await loadGroupTransactions(groupId);
    }
  }, [isAuthenticated, loadGroupTransactions]);

  const unsettleSplit = useCallback(async (
    groupId: string,
    transactionId: string,
    userId: string,
  ) => {
    if (isAuthenticated) {
      await unsettleSplitCloud(groupId, transactionId, userId);
    } else {
      await unsettleSplitLocal(groupId, transactionId, userId);
      await loadGroupTransactions(groupId);
    }
  }, [isAuthenticated, loadGroupTransactions]);

  const deleteGroupTransaction = useCallback(async (
    groupId: string,
    transactionId: string,
  ) => {
    if (isAuthenticated) {
      await deleteGroupTransactionCloud(groupId, transactionId);
    } else {
      await deleteGroupTransactionLocal(groupId, transactionId);
      await loadGroupTransactions(groupId);
    }
  }, [isAuthenticated, loadGroupTransactions]);

  const updateGroupTransaction = useCallback(async (
    groupId: string,
    transactionId: string,
    updates: Partial<Pick<GroupTransaction, 'amount' | 'description' | 'merchant' | 'splits'>>,
  ) => {
    if (isAuthenticated) {
      await updateGroupTransactionCloud(groupId, transactionId, updates);
    } else {
      await updateGroupTransactionLocal(groupId, transactionId, updates);
      await loadGroupTransactions(groupId);
    }
  }, [isAuthenticated, loadGroupTransactions]);

  const value = useMemo(() => ({
    groups,
    loading,
    refreshGroups,
    createGroup,
    activeGroupId,
    activeGroupTransactions,
    activeGroupDebts,
    loadGroupTransactions,
    settleSplit,
    unsettleSplit,
    deleteGroupTransaction,
    updateGroupTransaction,
  }), [groups, loading, refreshGroups, createGroup, activeGroupId, activeGroupTransactions, activeGroupDebts, loadGroupTransactions, settleSplit, unsettleSplit, deleteGroupTransaction, updateGroupTransaction]);

  return (
    <GroupContext.Provider value={value}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroups() {
  return useContext(GroupContext);
}
