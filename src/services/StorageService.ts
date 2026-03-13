import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  User, Transaction, Group, GroupTransaction, Split,
  TrackerType, ParsedTransaction, SavingsGoal, DailySpend, Settlement,
  SavingsJarEntry, FinanceItem, ReimbursementTrip,
  UserSubscriptionItem, InvestmentItem, EMIItem,
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
  SAVINGS_JAR: '@et_savings_jar',
  SETTLEMENTS: (groupId: string) => `@et_settlements_${groupId}`,
  SHARED_FINANCES: '@et_shared_finances',
  REIMBURSEMENT_TRIPS: '@et_reimbursement_trips',
  SUBSCRIPTIONS: '@et_subscriptions',
  INVESTMENTS: '@et_investments',
  EMIS: '@et_emis',
  SUBSCRIPTIONS_ONBOARDED: '@et_subscriptions_onboarded',
  INVESTMENTS_ONBOARDED: '@et_investments_onboarded',
  EMIS_ONBOARDED: '@et_emis_onboarded',
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

export async function removeGroupMember(groupId: string, memberUserId: string): Promise<void> {
  // Remove member from group
  const groups = await getGroups();
  const idx = groups.findIndex(g => g.id === groupId);
  if (idx === -1) return;
  groups[idx] = {
    ...groups[idx],
    members: groups[idx].members.filter(m => m.userId !== memberUserId),
  };
  await saveGroups(groups);

  // Mark all their unsettled splits as settled in existing transactions
  const txns = await getGroupTransactions(groupId);
  let changed = false;
  for (const txn of txns) {
    for (const split of txn.splits) {
      if (split.userId === memberUserId && !split.settled) {
        split.settled = true;
        changed = true;
      }
    }
  }
  if (changed) {
    await saveGroupTransactions(groupId, txns);
  }
}

export async function archiveGroup(groupId: string): Promise<void> {
  const groups = await getGroups();
  const idx = groups.findIndex(g => g.id === groupId);
  if (idx !== -1) {
    groups[idx] = { ...groups[idx], archived: true };
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
  // Last person absorbs rounding difference so splits always sum to exact amount
  const totalFromSplits = splitAmount * group.members.length;
  const roundingDiff = Math.round((parsed.amount - totalFromSplits) * 100) / 100;

  const splits: Split[] = group.members.map((member, index) => ({
    userId: member.userId,
    displayName: member.userId === userId ? 'You' : member.displayName,
    amount: index === group.members.length - 1 ? splitAmount + roundingDiff : splitAmount,
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
  const removedSplit = txn.splits.find(s => s.userId === memberUserId);
  if (!removedSplit) return;

  // Remove the member from splits
  const newSplits = txn.splits.filter(s => s.userId !== memberUserId);
  if (newSplits.length === 0) return;

  // Redistribute the removed member's share among non-payer members only
  const nonPayerSplits = newSplits.filter(s => s.userId !== txn.addedBy);
  if (nonPayerSplits.length > 0) {
    const extraPerPerson = Math.round((removedSplit.amount / nonPayerSplits.length) * 100) / 100;
    const totalExtra = extraPerPerson * nonPayerSplits.length;
    const roundingDiff = Math.round((removedSplit.amount - totalExtra) * 100) / 100;
    let applied = 0;
    txn.splits = newSplits.map(s => {
      if (s.userId === txn.addedBy) return s; // payer keeps same amount
      applied++;
      return {
        ...s,
        amount: s.amount + extraPerPerson + (applied === nonPayerSplits.length ? roundingDiff : 0),
      };
    });
  } else {
    // Only payer left — just keep their existing split
    txn.splits = newSplits;
  }

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

// ─── Shared Monthly Finances (reused across all goals) ──────────────────────

export interface SharedFinances {
  salary: number;
  emis: number;
  expenses: number;     // rent + bills
  maintenance: number;
  customFinances: FinanceItem[];
}

export async function getSharedFinances(): Promise<SharedFinances | null> {
  const raw = await AsyncStorage.getItem(KEYS.SHARED_FINANCES);
  return raw ? JSON.parse(raw) : null;
}

export async function saveSharedFinances(finances: SharedFinances): Promise<void> {
  await AsyncStorage.setItem(KEYS.SHARED_FINANCES, JSON.stringify(finances));

  // Also update all existing goals with the new finances
  const goals = await getGoals();
  for (const goal of goals) {
    goal.salary = finances.salary;
    goal.emis = finances.emis;
    goal.expenses = finances.expenses;
    goal.maintenance = finances.maintenance;
    goal.customFinances = finances.customFinances;

    // Recalculate budgets
    const totalFixed = finances.emis + finances.expenses + finances.maintenance
      + finances.customFinances.reduce((s, f) => s + f.amount, 0);
    const monthlySavings = finances.salary - totalFixed;
    goal.dailyBudget = Math.max((monthlySavings - goal.monthlyBudget) / 30, 0);
  }
  await AsyncStorage.setItem(KEYS.GOALS, JSON.stringify(goals));
}

// ─── Daily Spend Tracking (auto-computed from transactions) ──────────────────

export async function getDailySpends(): Promise<DailySpend[]> {
  const raw = await AsyncStorage.getItem(KEYS.DAILY_SPENDS);
  return raw ? JSON.parse(raw) : [];
}

async function saveDailySpends(spends: DailySpend[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.DAILY_SPENDS, JSON.stringify(spends));
}

/** Compute today's spend directly from personal + group-split transactions
 * @param excludeGroup If true, excludes group-split transactions (for goal budget when groupAffectsGoal is off) */
export async function computeTodaySpendFromTransactions(excludeGroup = false): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const all = await getAllTransactions();
  return all
    .filter(t => {
      if (t.trackerType === 'reimbursement') return false; // reimbursements don't count
      if (excludeGroup && t.trackerType === 'group') return false;
      const txDate = new Date(t.timestamp).toISOString().slice(0, 10);
      return txDate === today;
    })
    .reduce((s, t) => s + t.amount, 0);
}

/** Compute month's spend directly from personal + group-split transactions
 * @param excludeGroup If true, excludes group-split transactions */
export async function computeMonthSpendFromTransactions(excludeGroup = false): Promise<number> {
  const now = new Date();
  const all = await getAllTransactions();
  return all
    .filter(t => {
      if (t.trackerType === 'reimbursement') return false;
      if (excludeGroup && t.trackerType === 'group') return false;
      const d = new Date(t.timestamp);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, t) => s + t.amount, 0);
}

/** Get or create today's DailySpend entry with carryover from previous day
 * @param excludeGroup If true, excludes group-split transactions from spend */
export async function getOrCreateTodaySpend(dailyBudget: number, excludeGroup = false): Promise<DailySpend> {
  const today = new Date().toISOString().slice(0, 10);
  const all = await getDailySpends();
  const existing = all.find(d => d.date === today);

  if (existing) {
    // Update spent from real transactions
    const spent = await computeTodaySpendFromTransactions(excludeGroup);
    existing.spent = spent;
    existing.leftover = existing.effectiveBudget - spent;
    await saveDailySpends(all);
    return existing;
  }

  // New day — resolve yesterday's carryover
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const yesterdayEntry = all.find(d => d.date === yesterdayStr);

  let carryover = 0;
  if (yesterdayEntry && yesterdayEntry.leftover > 0) {
    // Default: auto-carry if user hasn't decided
    if (yesterdayEntry.leftoverAction === 'pending' || yesterdayEntry.leftoverAction === 'carry') {
      carryover = yesterdayEntry.leftover;
      yesterdayEntry.leftoverAction = 'carry';
    }
    // If 'save', carryover stays 0 (jar was already credited)
  }

  const spent = await computeTodaySpendFromTransactions(excludeGroup);
  const effectiveBudget = dailyBudget + carryover;

  const entry: DailySpend = {
    date: today,
    spent,
    baseBudget: dailyBudget,
    carryover,
    effectiveBudget,
    leftover: effectiveBudget - spent,
    leftoverAction: 'pending',
  };
  all.push(entry);
  await saveDailySpends(all);
  return entry;
}

/** Set yesterday's leftover action to 'save' and credit savings jar */
export async function saveLeftoverToJar(goalId: string): Promise<number> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const all = await getDailySpends();
  const entry = all.find(d => d.date === yesterdayStr);
  if (!entry || entry.leftover <= 0 || entry.leftoverAction === 'save') return 0;

  const amount = entry.leftover;
  entry.leftoverAction = 'save';
  await saveDailySpends(all);

  // Remove carryover from today's entry since user chose to save instead
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = all.find(d => d.date === today);
  if (todayEntry && todayEntry.carryover > 0) {
    todayEntry.carryover = 0;
    todayEntry.effectiveBudget = todayEntry.baseBudget;
    todayEntry.leftover = todayEntry.effectiveBudget - todayEntry.spent;
    await saveDailySpends(all);
  }

  // Credit the savings jar
  await addToSavingsJar(goalId, yesterdayStr, amount);

  // Update goal's savingsJar field
  const goals = await getGoals();
  const goal = goals.find(g => g.id === goalId);
  if (goal) {
    goal.savingsJar = (goal.savingsJar || 0) + amount;
    await saveGoal(goal);
  }

  return amount;
}

/** Carry forward yesterday's leftover explicitly */
export async function carryForwardLeftover(): Promise<number> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const all = await getDailySpends();
  const entry = all.find(d => d.date === yesterdayStr);
  if (!entry || entry.leftover <= 0 || entry.leftoverAction !== 'pending') return 0;

  entry.leftoverAction = 'carry';
  await saveDailySpends(all);
  return entry.leftover;
}

/** Check if yesterday has pending leftover decision */
export async function getYesterdayLeftover(): Promise<{ amount: number; action: string } | null> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const all = await getDailySpends();
  const entry = all.find(d => d.date === yesterdayStr);
  if (!entry || entry.leftover <= 0) return null;
  return { amount: entry.leftover, action: entry.leftoverAction };
}

// Keep legacy functions for backward compat
export async function getTodaySpend(): Promise<number> {
  return computeTodaySpendFromTransactions();
}

export async function getMonthSpend(): Promise<number> {
  return computeMonthSpendFromTransactions();
}

// ─── Savings Jar ────────────────────────────────────────────────────────────

export async function getSavingsJarEntries(goalId: string): Promise<SavingsJarEntry[]> {
  const raw = await AsyncStorage.getItem(KEYS.SAVINGS_JAR);
  const all: SavingsJarEntry[] = raw ? JSON.parse(raw) : [];
  return all.filter(e => e.goalId === goalId);
}

async function addToSavingsJar(goalId: string, date: string, amount: number): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.SAVINGS_JAR);
  const all: SavingsJarEntry[] = raw ? JSON.parse(raw) : [];
  all.push({ date, amount, goalId });
  await AsyncStorage.setItem(KEYS.SAVINGS_JAR, JSON.stringify(all));
}

/** User tapped "I invested this" — reset jar, add to totalSaved */
export async function emptyJar(goalId: string): Promise<number> {
  const goals = await getGoals();
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return 0;

  const jarAmount = goal.savingsJar || 0;
  goal.totalSaved = (goal.totalSaved || 0) + jarAmount;
  goal.savingsJar = 0;
  await saveGoal(goal);

  // Clear jar entries for this goal
  const raw = await AsyncStorage.getItem(KEYS.SAVINGS_JAR);
  const all: SavingsJarEntry[] = raw ? JSON.parse(raw) : [];
  const remaining = all.filter(e => e.goalId !== goalId);
  await AsyncStorage.setItem(KEYS.SAVINGS_JAR, JSON.stringify(remaining));

  return jarAmount;
}

// ─── Reimbursement Trips ─────────────────────────────────────────────────────

export async function getReimbursementTrips(): Promise<ReimbursementTrip[]> {
  const raw = await AsyncStorage.getItem(KEYS.REIMBURSEMENT_TRIPS);
  return raw ? JSON.parse(raw) : [];
}

async function saveReimbursementTrips(trips: ReimbursementTrip[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.REIMBURSEMENT_TRIPS, JSON.stringify(trips));
}

export async function createReimbursementTrip(name: string): Promise<ReimbursementTrip> {
  const trip: ReimbursementTrip = {
    id: generateId(),
    name,
    status: 'active',
    createdAt: Date.now(),
  };
  const all = await getReimbursementTrips();
  all.unshift(trip);
  await saveReimbursementTrips(all);
  return trip;
}

export async function completeReimbursementTrip(tripId: string): Promise<void> {
  const all = await getReimbursementTrips();
  const idx = all.findIndex(t => t.id === tripId);
  if (idx !== -1) {
    all[idx] = { ...all[idx], status: 'completed', completedAt: Date.now() };
    await saveReimbursementTrips(all);
  }
}

export async function archiveReimbursementTrip(tripId: string): Promise<void> {
  const all = await getReimbursementTrips();
  const idx = all.findIndex(t => t.id === tripId);
  if (idx !== -1) {
    all[idx] = { ...all[idx], status: 'archived' };
    await saveReimbursementTrips(all);
  }
}

export async function getTripTransactions(tripId: string): Promise<Transaction[]> {
  const all = await getAllTransactions();
  return all.filter(t => t.tripId === tripId).sort((a, b) => b.timestamp - a.timestamp);
}

export async function saveReimbursementExpense(
  parsed: ParsedTransaction,
  tripId: string,
  userId: string,
): Promise<Transaction> {
  const txn: Transaction = {
    id: generateId(),
    userId,
    amount: parsed.amount,
    description: buildDescription(parsed),
    merchant: parsed.merchant,
    source: parsed.bank || 'Bank',
    rawMessage: parsed.rawMessage,
    trackerType: 'reimbursement',
    tripId,
    timestamp: parsed.timestamp,
    createdAt: Date.now(),
  };
  const all = await getAllTransactions();
  all.unshift(txn);
  await saveAllTransactions(all);
  return txn;
}

// ─── Subscriptions ──────────────────────────────────────────────────────

export async function getSubscriptions(): Promise<UserSubscriptionItem[]> {
  const raw = await AsyncStorage.getItem(KEYS.SUBSCRIPTIONS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveSubscription(item: UserSubscriptionItem): Promise<void> {
  const all = await getSubscriptions();
  const idx = all.findIndex(s => s.id === item.id);
  if (idx !== -1) {
    all[idx] = item;
  } else {
    all.push(item);
  }
  await AsyncStorage.setItem(KEYS.SUBSCRIPTIONS, JSON.stringify(all));
}

export async function deleteSubscription(id: string): Promise<void> {
  const all = await getSubscriptions();
  await AsyncStorage.setItem(KEYS.SUBSCRIPTIONS, JSON.stringify(all.filter(s => s.id !== id)));
}

export async function hasSubscriptionsOnboarded(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.SUBSCRIPTIONS_ONBOARDED);
  return val === 'true';
}

export async function setSubscriptionsOnboarded(): Promise<void> {
  await AsyncStorage.setItem(KEYS.SUBSCRIPTIONS_ONBOARDED, 'true');
}

// ─── Investments ────────────────────────────────────────────────────────

export async function getInvestments(): Promise<InvestmentItem[]> {
  const raw = await AsyncStorage.getItem(KEYS.INVESTMENTS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveInvestment(item: InvestmentItem): Promise<void> {
  const all = await getInvestments();
  const idx = all.findIndex(s => s.id === item.id);
  if (idx !== -1) {
    all[idx] = item;
  } else {
    all.push(item);
  }
  await AsyncStorage.setItem(KEYS.INVESTMENTS, JSON.stringify(all));
}

export async function deleteInvestment(id: string): Promise<void> {
  const all = await getInvestments();
  await AsyncStorage.setItem(KEYS.INVESTMENTS, JSON.stringify(all.filter(s => s.id !== id)));
}

export async function hasInvestmentsOnboarded(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.INVESTMENTS_ONBOARDED);
  return val === 'true';
}

export async function setInvestmentsOnboarded(): Promise<void> {
  await AsyncStorage.setItem(KEYS.INVESTMENTS_ONBOARDED, 'true');
}

// ─── EMIs ───────────────────────────────────────────────────────────────

export async function getEMIs(): Promise<EMIItem[]> {
  const raw = await AsyncStorage.getItem(KEYS.EMIS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveEMI(item: EMIItem): Promise<void> {
  const all = await getEMIs();
  const idx = all.findIndex(s => s.id === item.id);
  if (idx !== -1) {
    all[idx] = item;
  } else {
    all.push(item);
  }
  await AsyncStorage.setItem(KEYS.EMIS, JSON.stringify(all));
}

export async function deleteEMI(id: string): Promise<void> {
  const all = await getEMIs();
  await AsyncStorage.setItem(KEYS.EMIS, JSON.stringify(all.filter(s => s.id !== id)));
}

export async function hasEMIsOnboarded(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.EMIS_ONBOARDED);
  return val === 'true';
}

export async function setEMIsOnboarded(): Promise<void> {
  await AsyncStorage.setItem(KEYS.EMIS_ONBOARDED, 'true');
}

// ─── Clear all data ──────────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  const groups = await getGroups();
  const keys = [
    KEYS.USER, KEYS.TRANSACTIONS, KEYS.GROUPS, KEYS.GOALS, KEYS.DAILY_SPENDS, KEYS.SAVINGS_JAR, KEYS.SHARED_FINANCES, KEYS.REIMBURSEMENT_TRIPS,
    KEYS.SUBSCRIPTIONS, KEYS.INVESTMENTS, KEYS.EMIS, KEYS.SUBSCRIPTIONS_ONBOARDED, KEYS.INVESTMENTS_ONBOARDED, KEYS.EMIS_ONBOARDED,
    ...groups.map(g => KEYS.GROUP_TRANSACTIONS(g.id)),
    ...groups.map(g => KEYS.SETTLEMENTS(g.id)),
    // Also clear cache, tracker state, and premium data
    '@et_cache_groups',
    ...groups.map(g => `@et_cache_gtxns_${g.id}`),
    '@et_tracker_state',
    '@et_subscription',
    '@et_referrals',
    '@et_referral_code',
    '@et_budgets',
  ];
  await Promise.all(keys.map(key => AsyncStorage.removeItem(key)));
}
