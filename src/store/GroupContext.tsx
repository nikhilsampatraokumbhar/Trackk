import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useMemo, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group, GroupTransaction, GroupMember, Debt } from '../models/types';
import {
  createGroupCloud, getGroupsCloud,
  getGroupTransactionsCloud, settleSplitCloud, unsettleSplitCloud,
  onGroupTransactionsChanged,
  deleteGroupTransactionCloud, updateGroupTransactionCloud,
  updateGroupCloud, deleteGroupCloud,
  addMemberToGroupCloud, removeMemberFromGroupCloud,
} from '../services/SyncService';
import {
  getGroups as getGroupsLocal, createGroup as createGroupLocal,
  getGroupTransactions as getGroupTransactionsLocal,
  settleSplit as settleSplitLocal,
  unsettleSplit as unsettleSplitLocal,
  deleteGroupTransaction as deleteGroupTransactionLocal,
  updateGroupTransaction as updateGroupTransactionLocal,
  updateGroup as updateGroupLocal,
  deleteGroup as deleteGroupLocal,
  removeGroupMember as removeGroupMemberLocal,
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
  updateGroupTransaction: (groupId: string, transactionId: string, updates: Partial<Pick<GroupTransaction, 'amount' | 'description' | 'merchant' | 'splits' | 'note' | 'category' | 'currency' | 'addedBy'>>) => Promise<void>;
  updateGroup: (groupId: string, updates: Partial<Group>) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  addGroupMember: (groupId: string, member: GroupMember) => Promise<void>;
  removeGroupMember: (groupId: string, memberUserId: string) => Promise<void>;
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
  updateGroup: async () => {},
  deleteGroup: async () => {},
  addGroupMember: async () => {},
  removeGroupMember: async () => {},
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
        const cloudGroups = await getGroupsCloud(user.id, user.phone);
        setGroups(cloudGroups);
        AsyncStorage.setItem(CACHE_KEYS.GROUPS, JSON.stringify(cloudGroups)).catch(() => {});
      } else {
        const localGroups = await getGroupsLocal();
        setGroups(localGroups);
      }
    } catch {
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
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEYS.GROUPS);
        if (cached && !cancelled) {
          const cachedGroups: Group[] = JSON.parse(cached);
          if (cachedGroups.length > 0) {
            setGroups(cachedGroups);
            setLoading(false);
          }
        }
      } catch {}

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
      group = await createGroupCloud(name, members, userId, user.phone, isTrip);
    } else {
      group = await createGroupLocal(name, members, userId, isTrip);
    }
    if (budget && budget > 0) {
      group.budget = budget;
    }

    setGroups(prev => {
      const updated = [group, ...prev];
      AsyncStorage.setItem(CACHE_KEYS.GROUPS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    return group;
  }, [isAuthenticated, user]);

  const loadGroupTransactions = useCallback(async (groupId: string) => {
    if (unsubscribe) {
      unsubscribe();
      setUnsubscribe(null);
    }

    setActiveGroupId(groupId);

    try {
      const cached = await AsyncStorage.getItem(CACHE_KEYS.GROUP_TXNS(groupId));
      if (cached) {
        const cachedTxns: GroupTransaction[] = JSON.parse(cached);
        if (cachedTxns.length > 0) {
          setActiveGroupTransactions(cachedTxns);
          setActiveGroupDebts(calculateDebts(cachedTxns));
        }
      }
    } catch {}

    if (isAuthenticated) {
      const unsub = onGroupTransactionsChanged(groupId, (txns) => {
        setActiveGroupTransactions(txns);
        setActiveGroupDebts(calculateDebts(txns));
        AsyncStorage.setItem(CACHE_KEYS.GROUP_TXNS(groupId), JSON.stringify(txns)).catch(() => {});
      });
      setUnsubscribe(() => unsub);
    } else {
      const txns = await getGroupTransactionsLocal(groupId);
      setActiveGroupTransactions(txns);
      setActiveGroupDebts(calculateDebts(txns));
    }
  }, [isAuthenticated, unsubscribe]);

  useEffect(() => {
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [unsubscribe]);

  const settleSplit = useCallback(async (
    groupId: string, transactionId: string, userId: string,
  ) => {
    if (isAuthenticated) {
      await settleSplitCloud(groupId, transactionId, userId);
    } else {
      await settleSplitLocal(groupId, transactionId, userId);
      await loadGroupTransactions(groupId);
    }
  }, [isAuthenticated, loadGroupTransactions]);

  const unsettleSplit = useCallback(async (
    groupId: string, transactionId: string, userId: string,
  ) => {
    if (isAuthenticated) {
      await unsettleSplitCloud(groupId, transactionId, userId);
    } else {
      await unsettleSplitLocal(groupId, transactionId, userId);
      await loadGroupTransactions(groupId);
    }
  }, [isAuthenticated, loadGroupTransactions]);

  const deleteGroupTransaction = useCallback(async (
    groupId: string, transactionId: string,
  ) => {
    if (isAuthenticated) {
      await deleteGroupTransactionCloud(groupId, transactionId);
    } else {
      await deleteGroupTransactionLocal(groupId, transactionId);
      await loadGroupTransactions(groupId);
    }
  }, [isAuthenticated, loadGroupTransactions]);

  const updateGroupTransaction = useCallback(async (
    groupId: string, transactionId: string,
    updates: Partial<Pick<GroupTransaction, 'amount' | 'description' | 'merchant' | 'splits' | 'note' | 'category' | 'currency' | 'addedBy'>>,
  ) => {
    if (isAuthenticated) {
      await updateGroupTransactionCloud(groupId, transactionId, updates);
    } else {
      await updateGroupTransactionLocal(groupId, transactionId, updates);
      await loadGroupTransactions(groupId);
    }
  }, [isAuthenticated, loadGroupTransactions]);

  const updateGroup = useCallback(async (groupId: string, updates: Partial<Group>) => {
    if (isAuthenticated) {
      await updateGroupCloud(groupId, updates);
    } else {
      await updateGroupLocal(groupId, updates);
    }
    // Update local state immediately
    setGroups(prev => {
      const updated = prev.map(g => g.id === groupId ? { ...g, ...updates } : g);
      AsyncStorage.setItem(CACHE_KEYS.GROUPS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, [isAuthenticated]);

  const deleteGroup = useCallback(async (groupId: string) => {
    if (isAuthenticated) {
      await deleteGroupCloud(groupId);
    } else {
      await deleteGroupLocal(groupId);
    }
    setGroups(prev => {
      const updated = prev.filter(g => g.id !== groupId);
      AsyncStorage.setItem(CACHE_KEYS.GROUPS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    // Clean transaction cache
    AsyncStorage.removeItem(CACHE_KEYS.GROUP_TXNS(groupId)).catch(() => {});
  }, [isAuthenticated]);

  const addGroupMember = useCallback(async (groupId: string, member: GroupMember) => {
    if (isAuthenticated) {
      await addMemberToGroupCloud(groupId, member);
    } else {
      // Local: update group directly
      const localGroups = await getGroupsLocal();
      const g = localGroups.find(gr => gr.id === groupId);
      if (g) {
        g.members.push(member);
        await updateGroupLocal(groupId, { members: g.members });
      }
    }
    // Refresh groups to get updated member list
    await refreshGroups();
  }, [isAuthenticated, refreshGroups]);

  const removeGroupMember = useCallback(async (groupId: string, memberUserId: string) => {
    if (isAuthenticated) {
      await removeMemberFromGroupCloud(groupId, memberUserId);
    } else {
      await removeGroupMemberLocal(groupId, memberUserId);
    }
    await refreshGroups();
  }, [isAuthenticated, refreshGroups]);

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
    updateGroup,
    deleteGroup,
    addGroupMember,
    removeGroupMember,
  }), [groups, loading, refreshGroups, createGroup, activeGroupId, activeGroupTransactions, activeGroupDebts, loadGroupTransactions, settleSplit, unsettleSplit, deleteGroupTransaction, updateGroupTransaction, updateGroup, deleteGroup, addGroupMember, removeGroupMember]);

  return (
    <GroupContext.Provider value={value}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroups() {
  return useContext(GroupContext);
}
