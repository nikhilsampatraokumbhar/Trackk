import React, {
  createContext, useContext, useState, useEffect,
  useCallback, ReactNode,
} from 'react';
import { Group, GroupTransaction, Debt } from '../models/types';
import {
  getGroups, createGroup as createGroupStorage,
  getGroupTransactions, settleSplit as settleSplitStorage,
} from '../services/StorageService';
import { calculateDebts } from '../services/DebtCalculator';

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
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeGroupTransactions, setActiveGroupTransactions] = useState<GroupTransaction[]>([]);
  const [activeGroupDebts, setActiveGroupDebts] = useState<Debt[]>([]);

  const refreshGroups = useCallback(async () => {
    const all = await getGroups();
    setGroups(all);
  }, []);

  useEffect(() => {
    refreshGroups().finally(() => setLoading(false));
  }, []);

  const createGroup = useCallback(async (
    name: string,
    members: Array<{ displayName: string; phone: string }>,
    userId: string,
    isTrip?: boolean,
  ): Promise<Group> => {
    const group = await createGroupStorage(name, members, userId, isTrip);
    setGroups(prev => [...prev, group]);
    return group;
  }, []);

  const loadGroupTransactions = useCallback(async (groupId: string) => {
    setActiveGroupId(groupId);
    const txns = await getGroupTransactions(groupId);
    setActiveGroupTransactions(txns);
    setActiveGroupDebts(calculateDebts(txns));
  }, []);

  const settleSplit = useCallback(async (
    groupId: string,
    transactionId: string,
    userId: string,
  ) => {
    await settleSplitStorage(groupId, transactionId, userId);
    await loadGroupTransactions(groupId);
  }, [loadGroupTransactions]);

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
