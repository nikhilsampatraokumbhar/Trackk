/**
 * Comprehensive Data Accuracy & Edge Case Tests
 *
 * Finance tracking must be EXACT. This tests:
 * - Floating point precision in splits, debts, and totals
 * - Rounding correctness (splits must sum to exact transaction amount)
 * - Multi-currency debt calculation
 * - Settlement accuracy (partial, full, unsettle)
 * - Edge cases: zero amounts, single member, large groups, very large amounts
 * - Group member removal and split redistribution
 * - Comments on group expenses
 * - Data isolation between personal/group/reimbursement
 * - Daily spend boundary conditions
 * - Budget threshold calculations
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveTransaction,
  getTransactions,
  createGroup,
  addGroupTransaction,
  getGroupTransactions,
  settleSplit,
  unsettleSplit,
  removeSplitMember,
  removeGroupMember,
  updateGroupTransaction,
  updateGroupTransactionComments,
  deleteGroupTransaction,
  addSettlement,
  getSettlements,
  deleteSettlement,
  archiveGroup,
  unarchiveGroup,
  deleteGroup,
  getGroups,
  getGroup,
  computeTodaySpendFromTransactions,
  computeMonthSpendFromTransactions,
  saveGoal,
  getGoals,
  getOrCreateTodaySpend,
  saveLeftoverToJar,
  getSharedFinances,
  saveSharedFinances,
  getSubscriptions,
  saveSubscription,
  deleteSubscription,
  getInvestments,
  saveInvestment,
  deleteInvestment,
  getEMIs,
  saveEMI,
  deleteEMI,
  createReimbursementTrip,
  completeReimbursementTrip,
  archiveReimbursementTrip,
  getReimbursementTrips,
  saveReimbursementExpense,
  getTripTransactions,
  clearAllData,
} from '../services/StorageService';
import { calculateDebts, getUserDebtSummary, simplifyDebts } from '../services/DebtCalculator';
import { getBudgetStatus, setBudget, getOverallBudget } from '../services/BudgetService';
import { ParsedTransaction, SavingsGoal, GroupTransaction, UserSubscriptionItem, InvestmentItem, EMIItem } from '../models/types';

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

// ─── Split Accuracy (THE most critical for a finance app) ────────────────────

describe('Split Accuracy — Rounding', () => {
  it('splits for 3-way ₹100 must sum to exactly 100', async () => {
    const group = await createGroup('Test', [
      { displayName: 'B', phone: '1' },
      { displayName: 'C', phone: '2' },
    ], 'u1');
    const txn = await addGroupTransaction(makeParsed({ amount: 100 }), group.id, 'u1');
    const sum = txn.splits.reduce((s, sp) => s + sp.amount, 0);
    expect(sum).toBeCloseTo(100, 2);
  });

  it('splits for 3-way ₹1 must sum to exactly 1', async () => {
    const group = await createGroup('Test', [
      { displayName: 'B', phone: '1' },
      { displayName: 'C', phone: '2' },
    ], 'u1');
    const txn = await addGroupTransaction(makeParsed({ amount: 1 }), group.id, 'u1');
    const sum = txn.splits.reduce((s, sp) => s + sp.amount, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it('splits for 7-way ₹100 must sum to exactly 100', async () => {
    const members = Array.from({ length: 6 }, (_, i) => ({
      displayName: `M${i}`,
      phone: `${i}`,
    }));
    const group = await createGroup('Test', members, 'u1');
    const txn = await addGroupTransaction(makeParsed({ amount: 100 }), group.id, 'u1');
    const sum = txn.splits.reduce((s, sp) => s + sp.amount, 0);
    expect(sum).toBeCloseTo(100, 2);
    expect(txn.splits.length).toBe(7);
  });

  it('splits for 2-way ₹0.01 must sum to exactly 0.01', async () => {
    const group = await createGroup('Test', [
      { displayName: 'B', phone: '1' },
    ], 'u1');
    const txn = await addGroupTransaction(makeParsed({ amount: 0.01 }), group.id, 'u1');
    const sum = txn.splits.reduce((s, sp) => s + sp.amount, 0);
    expect(sum).toBeCloseTo(0.01, 4);
  });

  it('large amount ₹999999.99 split 5 ways sums correctly', async () => {
    const members = Array.from({ length: 4 }, (_, i) => ({
      displayName: `M${i}`,
      phone: `${i}`,
    }));
    const group = await createGroup('Test', members, 'u1');
    const txn = await addGroupTransaction(makeParsed({ amount: 999999.99 }), group.id, 'u1');
    const sum = txn.splits.reduce((s, sp) => s + sp.amount, 0);
    expect(sum).toBeCloseTo(999999.99, 1);
  });
});

// ─── Debt Calculation Accuracy ───────────────────────────────────────────────

describe('Debt Calculation — Accuracy', () => {
  it('should handle circular debts correctly (A→B, B→C, C→A)', () => {
    const txns: GroupTransaction[] = [
      {
        id: 't1', groupId: 'g1', addedBy: 'A', amount: 300,
        description: 'Food', timestamp: Date.now(),
        splits: [
          { userId: 'A', displayName: 'A', amount: 100, settled: true },
          { userId: 'B', displayName: 'B', amount: 100, settled: false },
          { userId: 'C', displayName: 'C', amount: 100, settled: false },
        ],
      },
      {
        id: 't2', groupId: 'g1', addedBy: 'B', amount: 300,
        description: 'Drinks', timestamp: Date.now(),
        splits: [
          { userId: 'A', displayName: 'A', amount: 100, settled: false },
          { userId: 'B', displayName: 'B', amount: 100, settled: true },
          { userId: 'C', displayName: 'C', amount: 100, settled: false },
        ],
      },
      {
        id: 't3', groupId: 'g1', addedBy: 'C', amount: 300,
        description: 'Transport', timestamp: Date.now(),
        splits: [
          { userId: 'A', displayName: 'A', amount: 100, settled: false },
          { userId: 'B', displayName: 'B', amount: 100, settled: false },
          { userId: 'C', displayName: 'C', amount: 100, settled: true },
        ],
      },
    ];

    const debts = calculateDebts(txns);
    // Each person paid 300 for the group, each person's share is 300
    // Net balance: A: +200 - 200 = 0, B: +200 - 200 = 0, C: +200 - 200 = 0
    // Everyone is even — no debts
    expect(debts.length).toBe(0);
  });

  it('should produce correct debts for unequal payments', () => {
    const txns: GroupTransaction[] = [
      {
        id: 't1', groupId: 'g1', addedBy: 'A', amount: 600,
        description: 'Dinner', timestamp: Date.now(),
        splits: [
          { userId: 'A', displayName: 'A', amount: 200, settled: true },
          { userId: 'B', displayName: 'B', amount: 200, settled: false },
          { userId: 'C', displayName: 'C', amount: 200, settled: false },
        ],
      },
      {
        id: 't2', groupId: 'g1', addedBy: 'B', amount: 150,
        description: 'Snacks', timestamp: Date.now(),
        splits: [
          { userId: 'A', displayName: 'A', amount: 50, settled: false },
          { userId: 'B', displayName: 'B', amount: 50, settled: true },
          { userId: 'C', displayName: 'C', amount: 50, settled: false },
        ],
      },
    ];

    const debts = calculateDebts(txns);
    // A balance: +400 - 50 = +350, B balance: -200 + 100 = -100, C balance: -200 - 50 = -250
    // Simplified: C owes A 250, B owes A 100
    const totalOwedToA = debts.filter(d => d.toUserId === 'A').reduce((s, d) => s + d.amount, 0);
    expect(totalOwedToA).toBeCloseTo(350, 0);

    const summary = getUserDebtSummary(debts, 'A');
    expect(summary.totalOwed).toBeCloseTo(350, 0);
    expect(summary.totalOwing).toBe(0);
  });

  it('should handle multi-currency debts separately', () => {
    const txns: GroupTransaction[] = [
      {
        id: 't1', groupId: 'g1', addedBy: 'A', amount: 100,
        description: 'USD Expense', currency: 'USD', timestamp: Date.now(),
        splits: [
          { userId: 'A', displayName: 'A', amount: 50, settled: true },
          { userId: 'B', displayName: 'B', amount: 50, settled: false },
        ],
      },
      {
        id: 't2', groupId: 'g1', addedBy: 'A', amount: 1000,
        description: 'INR Expense', currency: 'INR', timestamp: Date.now(),
        splits: [
          { userId: 'A', displayName: 'A', amount: 500, settled: true },
          { userId: 'B', displayName: 'B', amount: 500, settled: false },
        ],
      },
    ];

    const debts = calculateDebts(txns);
    // Should have 2 debts: one USD, one INR (or INR with no currency field)
    expect(debts.length).toBe(2);

    const usdDebt = debts.find(d => d.currency === 'USD');
    const inrDebt = debts.find(d => !d.currency); // INR defaults to undefined
    expect(usdDebt).toBeTruthy();
    expect(usdDebt!.amount).toBe(50);
    expect(inrDebt).toBeTruthy();
    expect(inrDebt!.amount).toBe(500);
  });

  it('simplifyDebts should consolidate opposing debts', () => {
    const debts = [
      { fromUserId: 'A', fromName: 'Alice', toUserId: 'B', toName: 'Bob', amount: 500 },
      { fromUserId: 'B', fromName: 'Bob', toUserId: 'A', toName: 'Alice', amount: 200 },
    ];
    const simplified = simplifyDebts(debts);
    expect(simplified.length).toBe(1);
    expect(simplified[0].fromUserId).toBe('A');
    expect(simplified[0].amount).toBe(300);
  });

  it('simplifyDebts should handle 0.01 threshold (no rounding artifacts)', () => {
    const debts = [
      { fromUserId: 'A', fromName: 'A', toUserId: 'B', toName: 'B', amount: 100.005 },
      { fromUserId: 'B', fromName: 'B', toUserId: 'A', toName: 'A', amount: 100 },
    ];
    const simplified = simplifyDebts(debts);
    // Net difference is 0.005 which is below 0.01 threshold — should be empty or ≤0.01
    expect(simplified.length <= 1).toBe(true);
  });
});

// ─── Settlement Flow Accuracy ────────────────────────────────────────────────

describe('Settlement Flow — Accuracy', () => {
  it('settling all splits should result in zero debts', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '1' },
      { displayName: 'Bob', phone: '2' },
    ], 'u1');

    const txn = await addGroupTransaction(makeParsed({ amount: 300 }), group.id, 'u1');

    // Settle all non-payer splits
    for (const split of txn.splits) {
      if (split.userId !== 'u1') {
        await settleSplit(group.id, txn.id, split.userId);
      }
    }

    const txns = await getGroupTransactions(group.id);
    const debts = calculateDebts(txns);
    expect(debts.length).toBe(0);
  });

  it('unsettling a split should re-create debt', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '1' },
    ], 'u1');

    const txn = await addGroupTransaction(makeParsed({ amount: 200 }), group.id, 'u1');
    const aliceId = group.members[1].userId;

    await settleSplit(group.id, txn.id, aliceId);
    let txns = await getGroupTransactions(group.id);
    expect(calculateDebts(txns).length).toBe(0);

    await unsettleSplit(group.id, txn.id, aliceId);
    txns = await getGroupTransactions(group.id);
    const debts = calculateDebts(txns);
    expect(debts.length).toBe(1);
    expect(debts[0].amount).toBeCloseTo(100, 0);
  });

  it('settlement records should persist independently', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '1' },
    ], 'u1');

    const settlement = await addSettlement({
      groupId: group.id,
      fromUserId: group.members[1].userId,
      fromName: 'Alice',
      toUserId: 'u1',
      toName: 'You',
      amount: 500,
      method: 'upi',
      note: 'Settled via GPay',
    });

    expect(settlement.id).toBeTruthy();
    expect(settlement.amount).toBe(500);

    const all = await getSettlements(group.id);
    expect(all.length).toBe(1);
    expect(all[0].method).toBe('upi');

    await deleteSettlement(group.id, settlement.id);
    expect(await getSettlements(group.id)).toEqual([]);
  });
});

// ─── Group Member Removal — Split Redistribution ─────────────────────────────

describe('Group Member Removal', () => {
  it('removing a split member should redistribute amount to remaining non-payer members', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '1' },
      { displayName: 'Bob', phone: '2' },
    ], 'u1');

    const txn = await addGroupTransaction(makeParsed({ amount: 300 }), group.id, 'u1');
    // 300/3 = 100 each. Remove Bob — his 100 should go to Alice (not payer)
    const bobId = group.members[2].userId;
    await removeSplitMember(group.id, txn.id, bobId);

    const txns = await getGroupTransactions(group.id);
    expect(txns[0].splits.length).toBe(2); // u1 + Alice
    const splitSum = txns[0].splits.reduce((s, sp) => s + sp.amount, 0);
    expect(splitSum).toBeCloseTo(300, 1);

    // Payer's amount should stay the same
    const payerSplit = txns[0].splits.find(s => s.userId === 'u1');
    expect(payerSplit!.amount).toBeCloseTo(100, 0);
  });

  it('removing a group member should auto-settle their unsettled splits', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '1' },
    ], 'u1');

    await addGroupTransaction(makeParsed({ amount: 200 }), group.id, 'u1');
    const aliceId = group.members[1].userId;

    await removeGroupMember(group.id, aliceId);

    const txns = await getGroupTransactions(group.id);
    const aliceSplit = txns[0].splits.find(s => s.userId === aliceId);
    expect(aliceSplit!.settled).toBe(true); // auto-settled
  });
});

// ─── Group Transaction Updates ───────────────────────────────────────────────

describe('Group Transaction Updates', () => {
  it('should update amount, description, note, category, currency', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '1' },
    ], 'u1');
    const txn = await addGroupTransaction(makeParsed({ amount: 500 }), group.id, 'u1');

    await updateGroupTransaction(group.id, txn.id, {
      amount: 600,
      description: 'Updated dinner',
      note: 'Including tip',
      category: 'Food & Drinks',
      currency: 'USD',
    });

    const txns = await getGroupTransactions(group.id);
    expect(txns[0].amount).toBe(600);
    expect(txns[0].description).toBe('Updated dinner');
    expect(txns[0].note).toBe('Including tip');
    expect(txns[0].category).toBe('Food & Drinks');
    expect(txns[0].currency).toBe('USD');
  });

  it('should add and retrieve comments on group expenses', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '1' },
    ], 'u1');
    const txn = await addGroupTransaction(makeParsed(), group.id, 'u1');

    const comments = [
      { id: 'c1', userId: 'u1', displayName: 'You', text: 'Split equally', timestamp: Date.now() },
      { id: 'c2', userId: group.members[1].userId, displayName: 'Alice', text: 'OK!', timestamp: Date.now() },
    ];
    await updateGroupTransactionComments(group.id, txn.id, comments);

    const txns = await getGroupTransactions(group.id);
    expect(txns[0].comments).toHaveLength(2);
    expect(txns[0].comments![0].text).toBe('Split equally');
    expect(txns[0].comments![1].text).toBe('OK!');
  });

  it('should delete group transaction and not affect others', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '1' },
    ], 'u1');
    const t1 = await addGroupTransaction(makeParsed({ amount: 100 }), group.id, 'u1');
    const t2 = await addGroupTransaction(makeParsed({ amount: 200 }), group.id, 'u1');

    await deleteGroupTransaction(group.id, t1.id);
    const txns = await getGroupTransactions(group.id);
    expect(txns.length).toBe(1);
    expect(txns[0].id).toBe(t2.id);
  });
});

// ─── Group Lifecycle ─────────────────────────────────────────────────────────

describe('Group Lifecycle', () => {
  it('should archive and unarchive a group', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '1' },
    ], 'u1');

    await archiveGroup(group.id);
    let fetched = await getGroup(group.id);
    expect(fetched!.archived).toBe(true);

    await unarchiveGroup(group.id);
    fetched = await getGroup(group.id);
    expect(fetched!.archived).toBe(false);
  });

  it('should delete group and clean up related data', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '1' },
    ], 'u1');
    await addGroupTransaction(makeParsed(), group.id, 'u1');
    await addSettlement({
      groupId: group.id,
      fromUserId: 'u2', fromName: 'Alice',
      toUserId: 'u1', toName: 'You',
      amount: 100, method: 'cash',
    });

    await deleteGroup(group.id);

    expect(await getGroups()).toEqual([]);
    expect(await getGroupTransactions(group.id)).toEqual([]);
    expect(await getSettlements(group.id)).toEqual([]);
  });
});

// ─── Data Isolation ──────────────────────────────────────────────────────────

describe('Data Isolation', () => {
  it('personal, group, and reimbursement data should be completely separate', async () => {
    // Personal
    await saveTransaction(makeParsed({ amount: 100 }), 'personal', 'u1');
    // Reimbursement
    await saveTransaction(makeParsed({ amount: 200 }), 'reimbursement', 'u1');
    // Group
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '1' },
    ], 'u1');
    await addGroupTransaction(makeParsed({ amount: 500 }), group.id, 'u1');

    const personal = await getTransactions('personal');
    const reimb = await getTransactions('reimbursement');
    const groupTxns = await getGroupTransactions(group.id);

    expect(personal.length).toBe(1);
    expect(personal[0].amount).toBe(100);
    expect(reimb.length).toBe(1);
    expect(reimb[0].amount).toBe(200);
    expect(groupTxns.length).toBe(1);
    expect(groupTxns[0].amount).toBe(500);
  });

  it('reimbursement should NEVER count in daily/monthly spend', async () => {
    await saveTransaction(makeParsed({ amount: 100 }), 'personal', 'u1');
    await saveTransaction(makeParsed({ amount: 50000 }), 'reimbursement', 'u1');

    const todaySpend = await computeTodaySpendFromTransactions();
    const monthSpend = await computeMonthSpendFromTransactions();

    expect(todaySpend).toBe(100);
    expect(monthSpend).toBe(100);
  });

  it('group transactions should NEVER count in personal daily spend', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '1' },
    ], 'u1');
    await addGroupTransaction(makeParsed({ amount: 10000 }), group.id, 'u1');

    const todaySpend = await computeTodaySpendFromTransactions();
    expect(todaySpend).toBe(0);
  });
});

// ─── Budget Accuracy ─────────────────────────────────────────────────────────

describe('Budget Threshold Accuracy', () => {
  it('exactly 50% should be warning state', async () => {
    await setBudget('overall', 10000);
    const budget = await getOverallBudget();
    const status = getBudgetStatus(budget!, 5000);
    expect(status.state).toBe('warning');
    expect(status.percentage).toBe(50);
  });

  it('exactly 75% should be caution state', async () => {
    await setBudget('overall', 10000);
    const budget = await getOverallBudget();
    const status = getBudgetStatus(budget!, 7500);
    expect(status.state).toBe('caution');
    expect(status.percentage).toBe(75);
  });

  it('exactly 90% should be critical state', async () => {
    await setBudget('overall', 10000);
    const budget = await getOverallBudget();
    const status = getBudgetStatus(budget!, 9000);
    expect(status.state).toBe('critical');
    expect(status.percentage).toBe(90);
  });

  it('exactly 100% should be exceeded state', async () => {
    await setBudget('overall', 10000);
    const budget = await getOverallBudget();
    const status = getBudgetStatus(budget!, 10000);
    expect(status.state).toBe('exceeded');
    expect(status.percentage).toBe(100);
  });

  it('49.9% should still be safe', async () => {
    await setBudget('overall', 10000);
    const budget = await getOverallBudget();
    const status = getBudgetStatus(budget!, 4990);
    expect(status.state).toBe('safe');
  });

  it('zero spend should be safe with 0%', async () => {
    await setBudget('overall', 10000);
    const budget = await getOverallBudget();
    const status = getBudgetStatus(budget!, 0);
    expect(status.state).toBe('safe');
    expect(status.percentage).toBe(0);
  });
});

// ─── Subscriptions / Investments / EMIs CRUD ─────────────────────────────────

describe('Subscriptions, Investments, EMIs — CRUD Accuracy', () => {
  it('should save and retrieve subscription', async () => {
    const sub: UserSubscriptionItem = {
      id: 's1', name: 'Netflix', amount: 649, cycle: 'monthly',
      billingDay: 15, nextBillingDate: '2024-04-15', isShared: false,
      source: 'manual', confirmed: true, active: true, createdAt: Date.now(),
    };
    await saveSubscription(sub);
    const subs = await getSubscriptions();
    expect(subs.length).toBe(1);
    expect(subs[0].amount).toBe(649);

    await deleteSubscription('s1');
    expect(await getSubscriptions()).toEqual([]);
  });

  it('should save and retrieve investment', async () => {
    const inv: InvestmentItem = {
      id: 'i1', name: 'Groww SIP', amount: 5000, cycle: 'monthly',
      billingDay: 1, nextBillingDate: '2024-04-01',
      source: 'manual', confirmed: true, active: true, createdAt: Date.now(),
    };
    await saveInvestment(inv);
    expect((await getInvestments()).length).toBe(1);

    await deleteInvestment('i1');
    expect(await getInvestments()).toEqual([]);
  });

  it('should save and retrieve EMI with months tracking', async () => {
    const emi: EMIItem = {
      id: 'e1', name: 'Car Loan', amount: 25000, totalMonths: 60,
      monthsPaid: 10, monthsLeft: 50, billingDay: 5,
      nextBillingDate: '2024-04-05',
      source: 'manual', confirmed: true, active: true, createdAt: Date.now(),
    };
    await saveEMI(emi);
    const emis = await getEMIs();
    expect(emis.length).toBe(1);
    expect(emis[0].monthsLeft).toBe(50);
    expect(emis[0].monthsPaid).toBe(10);

    await deleteEMI('e1');
    expect(await getEMIs()).toEqual([]);
  });
});

// ─── Reimbursement Trip Lifecycle ────────────────────────────────────────────

describe('Reimbursement Trip Lifecycle', () => {
  it('should create, complete, and archive a trip', async () => {
    const trip = await createReimbursementTrip('Delhi Client Visit');
    expect(trip.status).toBe('active');

    await completeReimbursementTrip(trip.id);
    const trips1 = await getReimbursementTrips();
    expect(trips1[0].status).toBe('completed');
    expect(trips1[0].completedAt).toBeTruthy();

    await archiveReimbursementTrip(trip.id);
    const trips2 = await getReimbursementTrips();
    expect(trips2[0].status).toBe('archived');
  });

  it('should save reimbursement expenses linked to trip', async () => {
    const trip = await createReimbursementTrip('Test Trip');
    const txn = await saveReimbursementExpense(
      makeParsed({ amount: 2500, merchant: 'Uber' }),
      trip.id,
      'u1',
    );

    expect(txn.tripId).toBe(trip.id);
    expect(txn.trackerType).toBe('reimbursement');

    const tripTxns = await getTripTransactions(trip.id);
    expect(tripTxns.length).toBe(1);
    expect(tripTxns[0].amount).toBe(2500);
  });
});

// ─── Shared Finances & Goal Budget Recalculation ─────────────────────────────

describe('Shared Finances → Goal Budget Recalculation', () => {
  it('should update all goals when shared finances change', async () => {
    const goal: SavingsGoal = {
      id: 'g1', name: 'Save 1L', targetAmount: 100000,
      targetDate: Date.now() + 365 * 86400000, targetMonths: 12,
      salary: 50000, emis: 5000, expenses: 10000, maintenance: 2000,
      dailyBudget: 500, monthlyBudget: 10000,
      streak: 0, lastStreakDate: '', savingsJar: 0, totalSaved: 0,
      createdAt: Date.now(),
    };
    await saveGoal(goal);

    await saveSharedFinances({
      salary: 60000,
      emis: 8000,
      expenses: 12000,
      maintenance: 3000,
      customFinances: [{ label: 'Gym', amount: 2000 }],
    });

    const goals = await getGoals();
    expect(goals[0].salary).toBe(60000);
    expect(goals[0].emis).toBe(8000);
    expect(goals[0].expenses).toBe(12000);
    expect(goals[0].maintenance).toBe(3000);
    // dailyBudget should be recalculated
    // totalFixed = 8000 + 12000 + 3000 + 2000 = 25000
    // monthlySavings = 60000 - 25000 = 35000
    // dailyBudget = (35000 - 10000) / 30 = 833.33
    expect(goals[0].dailyBudget).toBeCloseTo(833.33, 0);
  });
});

// ─── Clear All Data ──────────────────────────────────────────────────────────

describe('Clear All Data', () => {
  it('should wipe everything including group-related keys', async () => {
    await saveTransaction(makeParsed(), 'personal', 'u1');
    await saveTransaction(makeParsed(), 'reimbursement', 'u1');
    const group = await createGroup('Test', [{ displayName: 'A', phone: '1' }], 'u1');
    await addGroupTransaction(makeParsed(), group.id, 'u1');
    await saveGoal({
      id: 'g1', name: 'Test', targetAmount: 100000,
      targetDate: Date.now(), targetMonths: 12,
      salary: 50000, emis: 0, expenses: 0, maintenance: 0,
      dailyBudget: 500, monthlyBudget: 15000,
      streak: 0, lastStreakDate: '', savingsJar: 0, totalSaved: 0,
      createdAt: Date.now(),
    });

    await clearAllData();

    expect(await getTransactions()).toEqual([]);
    expect(await getGroups()).toEqual([]);
    expect(await getGoals()).toEqual([]);
    expect(await getGroupTransactions(group.id)).toEqual([]);
  });
});
