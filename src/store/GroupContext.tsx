import React, {
  createContext, useContext, useState, useEffect,
  useCallback, ReactNode,
} from 'react';
import { Group, GroupTransaction, Debt } from '../models/types';
import {
  createGroupCloud, getGroupsCloud,
  getGroupTransactionsCloud, settleSplitCloud,
  onGroupTransactionsChanged,
} from '../services/SyncService';
import {
  getGroups as getGroupsLocal, createGroup as createGroupLocal,
  getGroupTransactions as getGroupTransactionsLocal,
  settleSplit as settleSplitLocal,
} from '../services/StorageService';
import { calculateDebts } from '../services/DebtCalculator';
import { useAuth } from './AuthContext';

interface GroupContextType {
  groups: Group[];
  loading: boolean;
  refreshGroups: () => Promise<void>;
  createGroup: (name: string, members: Array<{ displayName: string; phone: string }>, userId: string, isTrip?: boolean) => Promise<Group>;
  activeGroupId: string | null;
  activeGroupTransactions: GroupTransaction[];
  activeGroupDebts: Debt[];
  loadGroupTransactions: (groupId: string) => Promise<void>;
  settleSplit: (groupId: string, transactionId: string, userId: string) => Promise<void>;
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

  useEffect(() => {
    if (user) {
      refreshGroups().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  const createGroup = useCallback(async (
    name: string,
    members: Array<{ displayName: string; phone: string }>,
    userId: string,
    isTrip?: boolean,
  ): Promise<Group> => {
    let group: Group;

    if (isAuthenticated && user) {
      // Create in Firestore (synced)
      group = await createGroupCloud(name, members, userId, user.phone, isTrip);
    } else {
      // Create locally (offline fallback)
      group = await createGroupLocal(name, members, userId, isTrip);
    }

    setGroups(prev => [group, ...prev]);
    return group;
  }, [isAuthenticated, user]);

  const loadGroupTransactions = useCallback(async (groupId: string) => {
    // Cleanup previous listener
    if (unsubscribe) {
      unsubscribe();
      setUnsubscribe(null);
    }

    setActiveGroupId(groupId);

    if (isAuthenticated) {
      // Set up real-time listener for group transactions
      const unsub = onGroupTransactionsChanged(groupId, (txns) => {
        setActiveGroupTransactions(txns);
        setActiveGroupDebts(calculateDebts(txns));
      });
      setUnsubscribe(() => unsub);

      // Also do an initial fetch
      try {
        const txns = await getGroupTransactionsCloud(groupId);
        setActiveGroupTransactions(txns);
        setActiveGroupDebts(calculateDebts(txns));
      } catch {
        // Real-time listener will handle updates
      }
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

  return (
    <GroupContext.Provider value={{
      groups,
      loading,
      refreshGroups,
      createGroup,
      activeGroupId,
      activeGroupTransactions,
      activeGroupDebts,
      loadGroupTransactions,
      settleSplit,
    }}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroups() {
  return useContext(GroupContext);
}
