/**
 * Integration Tests: Data Flow Between Modules
 * Tests the full pipeline: Transaction → Storage → Goals → Daily Budget
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveTransaction, getTransactions,
  createGroup, addGroupTransaction,
  saveGoal, getGoals,
  computeTodaySpendFromTransactions,
  getOrCreateTodaySpend,
  emptyJar,
} from '../services/StorageService';
import { getBudgetStatus, setBudget, getOverallBudget } from '../services/BudgetService';
import { calculateDebts, getUserDebtSummary } from '../services/DebtCalculator';
import { parseTransactionSms, buildDescription } from '../services/TransactionParser';
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

const makeGoal = (overrides: Partial<SavingsGoal> = {}): SavingsGoal => ({
  id: 'goal1',
  name: 'Save for Trip',
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

describe('Integration: SMS → Parse → Store → Budget', () => {
  it('should parse SMS, store transaction, and reflect in budget', async () => {
    // 1. Parse SMS
    const parsed = parseTransactionSms(
      'Rs.2500.00 debited from a/c XX1234 at Swiggy on 01-01-24',
      'AD-HDFCBK',
    );
    expect(parsed).not.toBeNull();

    // 2. Save transaction
    const txn = await saveTransaction(parsed!, 'personal', 'user1');
    expect(txn.description).toContain('Swiggy');

    // 3. Check budget impact
    await setBudget('overall', 50000);
    const budget = await getOverallBudget();
    const monthSpend = parsed!.amount;
    const status = getBudgetStatus(budget!, monthSpend);
    expect(status.state).toBe('safe'); // 2500/50000 = 5%
    expect(status.percentage).toBe(5);
  });
});

describe('Integration: Personal Expense → Goal Daily Budget', () => {
  it('should deduct personal expense from daily budget', async () => {
    // 1. Set up goal
    await saveGoal(makeGoal({ dailyBudget: 1000 }));

    // 2. Add personal transaction
    await saveTransaction(makeParsed({ amount: 300 }), 'personal', 'user1');

    // 3. Check daily budget reflects spend
    const entry = await getOrCreateTodaySpend(1000);
    expect(entry.spent).toBe(300);
    expect(entry.effectiveBudget).toBe(1000);
    expect(entry.leftover).toBe(700);
  });

  it('should accumulate multiple expenses in daily budget', async () => {
    await saveGoal(makeGoal({ dailyBudget: 1000 }));
    await saveTransaction(makeParsed({ amount: 200 }), 'personal', 'u1');
    await saveTransaction(makeParsed({ amount: 150 }), 'personal', 'u1');
    await saveTransaction(makeParsed({ amount: 100 }), 'personal', 'u1');

    const entry = await getOrCreateTodaySpend(1000);
    expect(entry.spent).toBe(450);
    expect(entry.leftover).toBe(550);
  });
});

describe('Integration: Group Expense → Personal Split → Goal Budget', () => {
  it('should only count user split in personal transactions', async () => {
    const group = await createGroup(
      'Dinner',
      [{ displayName: 'Bob', phone: '111' }],
      'user1',
    );

    // Total bill is 1000, split between 2 people
    await addGroupTransaction(makeParsed({ amount: 1000 }), group.id, 'user1');

    // Check that only 500 (user's split) appears in personal
    const spend = await computeTodaySpendFromTransactions();
    expect(spend).toBe(500); // not 1000

    const entry = await getOrCreateTodaySpend(1000);
    expect(entry.spent).toBe(500);
    expect(entry.leftover).toBe(500);
  });

  it('should correctly calculate debts in group', async () => {
    const group = await createGroup(
      'Trip',
      [
        { displayName: 'Bob', phone: '111' },
        { displayName: 'Charlie', phone: '222' },
      ],
      'user1',
    );

    // User1 pays 900 (split 3 ways = 300 each)
    await addGroupTransaction(makeParsed({ amount: 900 }), group.id, 'user1');

    const txns = await (async () => {
      const raw = await AsyncStorage.getItem(`@et_group_txns_${group.id}`);
      return raw ? JSON.parse(raw) : [];
    })();

    const debts = calculateDebts(txns);
    expect(debts.length).toBe(2); // Bob and Charlie owe user1

    const summary = getUserDebtSummary(debts, 'user1');
    expect(summary.totalOwed).toBeCloseTo(600, 0); // 300 + 300
    expect(summary.totalOwing).toBe(0);
  });
});

describe('Integration: Reimbursement Exclusion', () => {
  it('should NOT include reimbursement expenses in goal budget', async () => {
    await saveGoal(makeGoal({ dailyBudget: 1000 }));

    // Personal expense
    await saveTransaction(makeParsed({ amount: 200 }), 'personal', 'u1');
    // Reimbursement (should NOT count)
    await saveTransaction(makeParsed({ amount: 5000 }), 'reimbursement', 'u1');

    const spend = await computeTodaySpendFromTransactions();
    expect(spend).toBe(200); // only personal

    const entry = await getOrCreateTodaySpend(1000);
    expect(entry.spent).toBe(200);
    expect(entry.leftover).toBe(800);
  });
});

describe('Integration: Savings Jar Lifecycle', () => {
  it('should accumulate savings and mark as invested', async () => {
    const goal = makeGoal({ savingsJar: 0, totalSaved: 0 });
    await saveGoal(goal);

    // Simulate adding to jar
    const goals1 = await getGoals();
    goals1[0].savingsJar = 500;
    await saveGoal(goals1[0]);

    // Empty jar (mark as invested)
    const amount = await emptyJar('goal1');
    expect(amount).toBe(500);

    // Verify totals
    const goals2 = await getGoals();
    expect(goals2[0].savingsJar).toBe(0);
    expect(goals2[0].totalSaved).toBe(500);

    // Add more to jar and empty again
    goals2[0].savingsJar = 300;
    await saveGoal(goals2[0]);
    await emptyJar('goal1');

    const goals3 = await getGoals();
    expect(goals3[0].totalSaved).toBe(800); // accumulated
  });
});

describe('Integration: Full Transaction Lifecycle', () => {
  it('should handle complete flow: parse → save → query → update → delete', async () => {
    // Parse
    const parsed = parseTransactionSms(
      'Rs.750.50 spent at McDonald\'s via card ending 4321',
      'AD-ICICIB',
    );
    expect(parsed).not.toBeNull();

    // Save
    const txn = await saveTransaction(parsed!, 'personal', 'user1');
    expect(txn.amount).toBe(750.50);

    // Query
    const fetched = await getTransactions('personal');
    expect(fetched.length).toBe(1);

    // Update (add note and tags)
    const { updateTransaction } = require('../services/StorageService');
    await updateTransaction(txn.id, { note: 'Lunch', tags: ['food'] });

    const updated = await (async () => {
      const { getTransaction } = require('../services/StorageService');
      return getTransaction(txn.id);
    })();
    expect(updated.note).toBe('Lunch');
    expect(updated.tags).toEqual(['food']);

    // Delete
    const { deleteTransaction } = require('../services/StorageService');
    await deleteTransaction(txn.id);
    const remaining = await getTransactions();
    expect(remaining.length).toBe(0);
  });
});

describe('Integration: Budget Status with Real Transactions', () => {
  it('should calculate accurate budget status from transaction data', async () => {
    await setBudget('overall', 10000);

    // Add several transactions
    await saveTransaction(makeParsed({ amount: 2000 }), 'personal', 'u1');
    await saveTransaction(makeParsed({ amount: 1500 }), 'personal', 'u1');
    await saveTransaction(makeParsed({ amount: 3000 }), 'personal', 'u1');
    // Reimbursement should NOT count
    await saveTransaction(makeParsed({ amount: 10000 }), 'reimbursement', 'u1');

    const budget = await getOverallBudget();
    const totalSpend = 2000 + 1500 + 3000; // 6500
    const status = getBudgetStatus(budget!, totalSpend);

    expect(status.percentage).toBe(65);
    expect(status.state).toBe('warning'); // 50-74%
  });
});
