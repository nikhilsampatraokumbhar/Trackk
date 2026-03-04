import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  User, Transaction, Group, GroupTransaction, Split,
  TrackerType, ParsedTransaction, SavingsGoal, DailySpend, Settlement,
} from '../models/types';
import { generateId } from '../utils/helpers';
import { buildDescription } from './TransactionParser';

const KEYS = {
  USER: '@et_user',
  TRANSACTIONS: '@et_transactions',
  GROUPS: '@et_groups',
  GROUP_TRANSACTIONS: (groupId: string) => `@et_group_txns_${groupId}`,
  GOALS: '@et_goals',
  DAILY_SPENDS: '@et_daily_spends',
  SETTLEMENTS: (groupId: string) => `@et_settlements_${groupId}`,
};

// ─── User ────────────────────────────────────────────────────────────────────

export async function getOrCreateUser(): Promise<User> {
  const raw = await AsyncStorage.getItem(KEYS.USER);
  if (raw) return JSON.parse(raw);

  const user: User = {
    id: generateId(),
    displayName: 'User',
    phone: '',
    createdAt: Date.now(),
  };
  await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
  return user;
}

export async function updateUserProfile(data: Partial<User>): Promise<User> {
  const user = await getOrCreateUser();
  const updated = { ...user, ...data };
  await AsyncStorage.setItem(KEYS.USER, JSON.stringify(updated));
  return updated;
}

// ─── Transactions ────────────────────────────────────────────────────────────

async function getAllTransactions(): Promise<Transaction[]> {
  const raw = await AsyncStorage.getItem(KEYS.TRANSACTIONS);
  return raw ? JSON.parse(raw) : [];
}

async function saveAllTransactions(txns: Transaction[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(txns));
}

export async function saveTransaction(
  parsed: ParsedTransaction,
  trackerType: TrackerType,
  userId: string,
  groupId?: string,
): Promise<Transaction> {
  const txn: Transaction = {
    id: generateId(),
    userId,
    amount: parsed.amount,
    description: buildDescription(parsed),
    merchant: parsed.merchant,
    source: parsed.bank || 'Bank',
    rawMessage: parsed.rawMessage,
    trackerType,
    groupId,
    timestamp: parsed.timestamp,
    createdAt: Date.now(),
  };

  const all = await getAllTransactions();
  all.unshift(txn);
  await saveAllTransactions(all);
  return txn;
}

export async function getTransactions(
  trackerType?: TrackerType,
  groupId?: string,
): Promise<Transaction[]> {
  const all = await getAllTransactions();
  return all.filter(t => {
    if (groupId) return t.groupId === groupId;
    if (trackerType) return t.trackerType === trackerType && !t.groupId;
    return true;
  });
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  const all = await getAllTransactions();
  await saveAllTransactions(all.filter(t => t.id !== transactionId));
}

export async function getTransaction(transactionId: string): Promise<Transaction | null> {
  const all = await getAllTransactions();
  return all.find(t => t.id === transactionId) || null;
}

export async function updateTransaction(transactionId: string, data: Partial<Transaction>): Promise<void> {
  const all = await getAllTransactions();
  const idx = all.findIndex(t => t.id === transactionId);
  if (idx !== -1) {
    all[idx] = { ...all[idx], ...data };
    await saveAllTransactions(all);
  }
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export async function getGroups(): Promise<Group[]> {
  const raw = await AsyncStorage.getItem(KEYS.GROUPS);
  return raw ? JSON.parse(raw) : [];
}

async function saveGroups(groups: Group[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.GROUPS, JSON.stringify(groups));
}

export async function createGroup(
  name: string,
  members: Array<{ displayName: string; phone: string }>,
  userId: string,
  isTrip?: boolean,
): Promise<Group> {
  const group: Group = {
    id: generateId(),
    name,
    members: [
      { userId, displayName: 'You', phone: '' },
      ...members.map(m => ({ userId: generateId(), ...m })),
    ],
    createdBy: userId,
    createdAt: Date.now(),
    isTrip: isTrip || false,
  };

  const groups = await getGroups();
  groups.push(group);
  await saveGroups(groups);
  return group;
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const groups = await getGroups();
  return groups.find(g => g.id === groupId) || null;
}

export async function updateGroup(groupId: string, data: Partial<Group>): Promise<void> {
  const groups = await getGroups();
  const idx = groups.findIndex(g => g.id === groupId);
  if (idx !== -1) {
    groups[idx] = { ...groups[idx], ...data };
    await saveGroups(groups);
  }
}

// ─── Group Transactions ──────────────────────────────────────────────────────

export async function getGroupTransactions(groupId: string): Promise<GroupTransaction[]> {
  const raw = await AsyncStorage.getItem(KEYS.GROUP_TRANSACTIONS(groupId));
  return raw ? JSON.parse(raw) : [];
}

async function saveGroupTransactions(groupId: string, txns: GroupTransaction[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.GROUP_TRANSACTIONS(groupId), JSON.stringify(txns));
}

export async function addGroupTransaction(
  parsed: ParsedTransaction,
  groupId: string,
  userId: string,
): Promise<GroupTransaction> {
  const group = await getGroup(groupId);
  if (!group) throw new Error('Group not found');

  const splitAmount = Math.round((parsed.amount / group.members.length) * 100) / 100;

  const splits: Split[] = group.members.map(member => ({
    userId: member.userId,
    displayName: member.userId === userId ? 'You' : member.displayName,
    amount: splitAmount,
    settled: member.userId === userId,
  }));

  const txn: GroupTransaction = {
    id: generateId(),
    groupId,
    addedBy: userId,
    amount: parsed.amount,
    description: buildDescription(parsed),
    merchant: parsed.merchant,
    timestamp: parsed.timestamp,
    splits,
  };

  const all = await getGroupTransactions(groupId);
  all.unshift(txn);
  await saveGroupTransactions(groupId, all);

  // Save only user's split to personal transactions
  const splitParsed = { ...parsed, amount: splitAmount };
  await saveTransaction(splitParsed, 'group', userId, groupId);

  return txn;
}

export async function removeSplitMember(
  groupId: string,
  transactionId: string,
  memberUserId: string,
): Promise<void> {
  const all = await getGroupTransactions(groupId);
  const idx = all.findIndex(t => t.id === transactionId);
  if (idx === -1) return;

  const txn = { ...all[idx] };
  const newSplits = txn.splits.filter(s => s.userId !== memberUserId);
  if (newSplits.length === 0) return;

  const perPerson = Math.round((txn.amount / newSplits.length) * 100) / 100;
  txn.splits = newSplits.map(s => ({ ...s, amount: perPerson }));
  all[idx] = txn;
  await saveGroupTransactions(groupId, all);
}

export async function settleSplit(
  groupId: string,
  transactionId: string,
  userId: string,
): Promise<void> {
  const all = await getGroupTransactions(groupId);
  const idx = all.findIndex(t => t.id === transactionId);
  if (idx === -1) return;

  const txn = { ...all[idx] };
  txn.splits = txn.splits.map(s =>
    s.userId === userId ? { ...s, settled: true } : s,
  );
  all[idx] = txn;
  await saveGroupTransactions(groupId, all);
}

// ─── Settlements ─────────────────────────────────────────────────────────────

export async function getSettlements(groupId: string): Promise<Settlement[]> {
  const raw = await AsyncStorage.getItem(KEYS.SETTLEMENTS(groupId));
  return raw ? JSON.parse(raw) : [];
}

export async function addSettlement(settlement: Omit<Settlement, 'id' | 'timestamp'>): Promise<Settlement> {
  const full: Settlement = {
    ...settlement,
    id: generateId(),
    timestamp: Date.now(),
  };
  const all = await getSettlements(settlement.groupId);
  all.unshift(full);
  await AsyncStorage.setItem(KEYS.SETTLEMENTS(settlement.groupId), JSON.stringify(all));
  return full;
}

// ─── Savings Goals ───────────────────────────────────────────────────────────

export async function getGoals(): Promise<SavingsGoal[]> {
  const raw = await AsyncStorage.getItem(KEYS.GOALS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveGoal(goal: SavingsGoal): Promise<void> {
  const all = await getGoals();
  const idx = all.findIndex(g => g.id === goal.id);
  if (idx !== -1) {
    all[idx] = goal;
  } else {
    all.push(goal);
  }
  await AsyncStorage.setItem(KEYS.GOALS, JSON.stringify(all));
}

export async function deleteGoal(goalId: string): Promise<void> {
  const all = await getGoals();
  await AsyncStorage.setItem(KEYS.GOALS, JSON.stringify(all.filter(g => g.id !== goalId)));
}

// ─── Daily Spend Tracking ────────────────────────────────────────────────────

export async function getDailySpends(): Promise<DailySpend[]> {
  const raw = await AsyncStorage.getItem(KEYS.DAILY_SPENDS);
  return raw ? JSON.parse(raw) : [];
}

export async function updateDailySpend(date: string, amount: number, budget: number): Promise<void> {
  const all = await getDailySpends();
  const idx = all.findIndex(d => d.date === date);
  const spent = idx !== -1 ? all[idx].spent + amount : amount;
  const entry: DailySpend = { date, spent, budget, withinBudget: spent <= budget };
  if (idx !== -1) all[idx] = entry;
  else all.push(entry);
  await AsyncStorage.setItem(KEYS.DAILY_SPENDS, JSON.stringify(all));
}

export async function getTodaySpend(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const all = await getDailySpends();
  return all.find(d => d.date === today)?.spent || 0;
}

export async function getMonthSpend(): Promise<number> {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const all = await getDailySpends();
  return all.filter(d => d.date.startsWith(prefix)).reduce((s, d) => s + d.spent, 0);
}

// ─── Clear all data ──────────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  const groups = await getGroups();
  const keys = [
    KEYS.USER, KEYS.TRANSACTIONS, KEYS.GROUPS, KEYS.GOALS, KEYS.DAILY_SPENDS,
    ...groups.map(g => KEYS.GROUP_TRANSACTIONS(g.id)),
    ...groups.map(g => KEYS.SETTLEMENTS(g.id)),
  ];
  for (const key of keys) await AsyncStorage.removeItem(key);
}
