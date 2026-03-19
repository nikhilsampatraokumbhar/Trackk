import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getOrCreateUser, updateUserProfile,
  saveTransaction, getTransactions, deleteTransaction, getTransaction, updateTransaction,
  getGroups, createGroup, getGroup,
  addGroupTransaction, getGroupTransactions, settleSplit, removeSplitMember,
  getGoals, saveGoal, deleteGoal,
  computeTodaySpendFromTransactions, computeMonthSpendFromTransactions,
  getOrCreateTodaySpend, saveLeftoverToJar, carryForwardLeftover, getYesterdayLeftover,
  getSavingsJarEntries, emptyJar,
  clearAllData,
} from '../services/StorageService';
import { ParsedTransaction, SavingsGoal } from '../models/types';

beforeEach(() => {
  (AsyncStorage as any)._clear();
  jest.clearAllMocks();
});

const makeParsed = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
  amount: 500,
  type: 'debit',
  merchant: 'Test Store',
  rawMessage: 'Rs.500 debited at Test Store',
  timestamp: Date.now(),
  ...overrides,
});

describe('StorageService', () => {
  // ─── User ─────────────────────────────────────────────────────────────
  describe('User Management', () => {
    it('should create a new user on first call', async () => {
      const user = await getOrCreateUser();
      expect(user.id).toBeTruthy();
      expect(user.displayName).toBe('User');
      expect(user.phone).toBe('');
    });

    it('should return existing user on subsequent calls', async () => {
      const user1 = await getOrCreateUser();
      const user2 = await getOrCreateUser();
      expect(user1.id).toBe(user2.id);
    });

    it('should update user profile', async () => {
      await getOrCreateUser();
      const updated = await updateUserProfile({ displayName: 'John', phone: '9876543210' });
      expect(updated.displayName).toBe('John');
      expect(updated.phone).toBe('9876543210');

      // Verify persistence
      const fetched = await getOrCreateUser();
      expect(fetched.displayName).toBe('John');
    });
  });

  // ─── Transactions ────────────────────────────────────────────────────
  describe('Transaction CRUD', () => {
    it('should save a transaction', async () => {
      const txn = await saveTransaction(makeParsed(), 'personal', 'user1');
      expect(txn.id).toBeTruthy();
      expect(txn.amount).toBe(500);
      expect(txn.trackerType).toBe('personal');
      expect(txn.description).toContain('Test Store');
    });

    it('should get all transactions', async () => {
      await saveTransaction(makeParsed(), 'personal', 'user1');
      await saveTransaction(makeParsed({ amount: 200 }), 'reimbursement', 'user1');
      const all = await getTransactions();
      expect(all.length).toBe(2);
    });

    it('should filter by tracker type', async () => {
      await saveTransaction(makeParsed(), 'personal', 'user1');
      await saveTransaction(makeParsed({ amount: 200 }), 'reimbursement', 'user1');
      const personal = await getTransactions('personal');
      expect(personal.length).toBe(1);
      expect(personal[0].trackerType).toBe('personal');
    });

    it('should delete a transaction', async () => {
      const txn = await saveTransaction(makeParsed(), 'personal', 'user1');
      await deleteTransaction(txn.id);
      const all = await getTransactions();
      expect(all.length).toBe(0);
    });

    it('should get a single transaction', async () => {
      const txn = await saveTransaction(makeParsed(), 'personal', 'user1');
      const fetched = await getTransaction(txn.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(txn.id);
    });

    it('should return null for non-existent transaction', async () => {
      const fetched = await getTransaction('nonexistent');
      expect(fetched).toBeNull();
    });

    it('should update transaction fields', async () => {
      const txn = await saveTransaction(makeParsed(), 'personal', 'user1');
      await updateTransaction(txn.id, { note: 'Test note', tags: ['food', 'lunch'] });
      const updated = await getTransaction(txn.id);
      expect(updated!.note).toBe('Test note');
      expect(updated!.tags).toEqual(['food', 'lunch']);
    });

    it('should prepend new transactions (newest first)', async () => {
      await saveTransaction(makeParsed({ amount: 100 }), 'personal', 'user1');
      await saveTransaction(makeParsed({ amount: 200 }), 'personal', 'user1');
      const all = await getTransactions();
      expect(all[0].amount).toBe(200); // newest first
    });
  });

  // ─── Groups ──────────────────────────────────────────────────────────
  describe('Group Management', () => {
    it('should create a group', async () => {
      const group = await createGroup('Trip', [{ displayName: 'Bob', phone: '111' }], 'user1');
      expect(group.name).toBe('Trip');
      expect(group.members.length).toBe(2); // creator + Bob
      expect(group.members[0].displayName).toBe('You');
    });

    it('should retrieve groups', async () => {
      await createGroup('Trip', [{ displayName: 'Bob', phone: '111' }], 'user1');
      const groups = await getGroups();
      expect(groups.length).toBe(1);
    });

    it('should get a single group', async () => {
      const group = await createGroup('Trip', [{ displayName: 'Bob', phone: '111' }], 'user1');
      const fetched = await getGroup(group.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe('Trip');
    });

    it('should return null for non-existent group', async () => {
      expect(await getGroup('nonexistent')).toBeNull();
    });
  });

  // ─── Group Transactions ──────────────────────────────────────────────
  describe('Group Transactions', () => {
    it('should add a group transaction with split', async () => {
      const group = await createGroup('Trip', [{ displayName: 'Bob', phone: '111' }], 'user1');
      const txn = await addGroupTransaction(makeParsed({ amount: 1000 }), group.id, 'user1');

      expect(txn.amount).toBe(1000);
      expect(txn.splits.length).toBe(2);
      expect(txn.splits[0].amount).toBe(500); // 1000 / 2
      expect(txn.splits[0].settled).toBe(true); // payer's split is settled
      expect(txn.splits[1].settled).toBe(false);
    });

    it('should not save group splits to personal transactions', async () => {
      const group = await createGroup('Trip', [{ displayName: 'Bob', phone: '111' }], 'user1');
      await addGroupTransaction(makeParsed({ amount: 1000 }), group.id, 'user1');

      // Personal transactions should be empty — group data stays separate
      const all = await getTransactions();
      expect(all.length).toBe(0);
    });

    it('should handle 3-way split with rounding', async () => {
      const group = await createGroup(
        'Trip',
        [{ displayName: 'Bob', phone: '111' }, { displayName: 'Charlie', phone: '222' }],
        'user1',
      );
      const txn = await addGroupTransaction(makeParsed({ amount: 100 }), group.id, 'user1');

      // 100 / 3 = 33.33, last person gets 33.34
      const splitSum = txn.splits.reduce((s, sp) => s + sp.amount, 0);
      expect(splitSum).toBeCloseTo(100, 2);
    });

    it('should settle a split', async () => {
      const group = await createGroup('Trip', [{ displayName: 'Bob', phone: '111' }], 'user1');
      const txn = await addGroupTransaction(makeParsed({ amount: 1000 }), group.id, 'user1');

      const bobId = group.members[1].userId;
      await settleSplit(group.id, txn.id, bobId);

      const txns = await getGroupTransactions(group.id);
      const bobSplit = txns[0].splits.find(s => s.userId === bobId);
      expect(bobSplit!.settled).toBe(true);
    });

    it('should remove a split member and recalculate', async () => {
      const group = await createGroup(
        'Trip',
        [{ displayName: 'Bob', phone: '111' }, { displayName: 'Charlie', phone: '222' }],
        'user1',
      );
      const txn = await addGroupTransaction(makeParsed({ amount: 300 }), group.id, 'user1');

      const charlieId = group.members[2].userId;
      await removeSplitMember(group.id, txn.id, charlieId);

      const txns = await getGroupTransactions(group.id);
      expect(txns[0].splits.length).toBe(2);
      const splitSum = txns[0].splits.reduce((s, sp) => s + sp.amount, 0);
      expect(splitSum).toBeCloseTo(300, 2);
    });

    it('should throw on group not found', async () => {
      await expect(addGroupTransaction(makeParsed(), 'nonexistent', 'user1'))
        .rejects.toThrow('Group not found');
    });
  });

  // ─── Goals ───────────────────────────────────────────────────────────
  describe('Savings Goals', () => {
    const makeGoal = (overrides: Partial<SavingsGoal> = {}): SavingsGoal => ({
      id: 'goal1',
      name: 'Save 1 Lakh',
      targetAmount: 100000,
      targetDate: Date.now() + 365 * 24 * 60 * 60 * 1000,
      targetMonths: 12,
      salary: 50000,
      emis: 10000,
      expenses: 20000,
      maintenance: 5000,
      dailyBudget: 500,
      monthlyBudget: 15000,
      streak: 0,
      lastStreakDate: '',
      savingsJar: 0,
      totalSaved: 0,
      createdAt: Date.now(),
      ...overrides,
    });

    it('should save and retrieve a goal', async () => {
      const goal = makeGoal();
      await saveGoal(goal);
      const goals = await getGoals();
      expect(goals.length).toBe(1);
      expect(goals[0].name).toBe('Save 1 Lakh');
    });

    it('should update existing goal', async () => {
      await saveGoal(makeGoal());
      await saveGoal(makeGoal({ streak: 5 }));
      const goals = await getGoals();
      expect(goals.length).toBe(1);
      expect(goals[0].streak).toBe(5);
    });

    it('should delete a goal', async () => {
      await saveGoal(makeGoal());
      await deleteGoal('goal1');
      expect(await getGoals()).toEqual([]);
    });
  });

  // ─── Daily Spend Tracking ────────────────────────────────────────────
  describe('Daily Spend Tracking', () => {
    it('should compute today spend from transactions', async () => {
      await saveTransaction(makeParsed({ amount: 100, timestamp: Date.now() }), 'personal', 'u1');
      await saveTransaction(makeParsed({ amount: 200, timestamp: Date.now() }), 'personal', 'u1');
      const spend = await computeTodaySpendFromTransactions();
      expect(spend).toBe(300);
    });

    it('should exclude reimbursements from today spend', async () => {
      await saveTransaction(makeParsed({ amount: 100 }), 'personal', 'u1');
      await saveTransaction(makeParsed({ amount: 500 }), 'reimbursement', 'u1');
      const spend = await computeTodaySpendFromTransactions();
      expect(spend).toBe(100); // only personal
    });

    it('should exclude old transactions from today spend', async () => {
      const yesterday = Date.now() - 48 * 60 * 60 * 1000;
      await saveTransaction(makeParsed({ amount: 100 }), 'personal', 'u1');
      await saveTransaction(makeParsed({ amount: 200, timestamp: yesterday }), 'personal', 'u1');
      const spend = await computeTodaySpendFromTransactions();
      expect(spend).toBe(100);
    });

    it('should compute month spend from transactions', async () => {
      await saveTransaction(makeParsed({ amount: 100 }), 'personal', 'u1');
      await saveTransaction(makeParsed({ amount: 200 }), 'personal', 'u1');
      const spend = await computeMonthSpendFromTransactions();
      expect(spend).toBe(300);
    });

    it('should exclude reimbursements from month spend', async () => {
      await saveTransaction(makeParsed({ amount: 100 }), 'personal', 'u1');
      await saveTransaction(makeParsed({ amount: 500 }), 'reimbursement', 'u1');
      const spend = await computeMonthSpendFromTransactions();
      expect(spend).toBe(100);
    });

    it('should create today daily spend entry', async () => {
      const entry = await getOrCreateTodaySpend(500);
      expect(entry.baseBudget).toBe(500);
      expect(entry.effectiveBudget).toBe(500);
      expect(entry.leftoverAction).toBe('pending');
    });

    it('should update existing daily spend with current transactions', async () => {
      await getOrCreateTodaySpend(500);
      await saveTransaction(makeParsed({ amount: 100 }), 'personal', 'u1');
      const entry = await getOrCreateTodaySpend(500);
      expect(entry.spent).toBe(100);
      expect(entry.leftover).toBe(400);
    });
  });

  // ─── Savings Jar ─────────────────────────────────────────────────────
  describe('Savings Jar', () => {
    const makeGoal = (): SavingsGoal => ({
      id: 'goal1', name: 'Test', targetAmount: 100000,
      targetDate: Date.now() + 365 * 24 * 60 * 60 * 1000,
      targetMonths: 12,
      salary: 50000, emis: 0, expenses: 0, maintenance: 0,
      dailyBudget: 500, monthlyBudget: 15000,
      streak: 0, lastStreakDate: '', savingsJar: 0, totalSaved: 0,
      createdAt: Date.now(),
    });

    it('should empty jar and add to totalSaved', async () => {
      const goal = makeGoal();
      goal.savingsJar = 1500;
      await saveGoal(goal);

      const amount = await emptyJar('goal1');
      expect(amount).toBe(1500);

      const goals = await getGoals();
      expect(goals[0].savingsJar).toBe(0);
      expect(goals[0].totalSaved).toBe(1500);
    });

    it('should return 0 for non-existent goal', async () => {
      expect(await emptyJar('nonexistent')).toBe(0);
    });

    it('should accumulate totalSaved across multiple empties', async () => {
      const goal = makeGoal();
      goal.savingsJar = 500;
      await saveGoal(goal);
      await emptyJar('goal1');

      const goals1 = await getGoals();
      goals1[0].savingsJar = 300;
      await saveGoal(goals1[0]);
      await emptyJar('goal1');

      const goals2 = await getGoals();
      expect(goals2[0].totalSaved).toBe(800);
      expect(goals2[0].savingsJar).toBe(0);
    });
  });

  // ─── Clear All Data ──────────────────────────────────────────────────
  describe('Clear All Data', () => {
    it('should clear everything', async () => {
      await saveTransaction(makeParsed(), 'personal', 'u1');
      await getOrCreateUser();
      await clearAllData();

      expect(await getTransactions()).toEqual([]);
      expect(await getGoals()).toEqual([]);
      expect(await getGroups()).toEqual([]);
    });
  });
});
