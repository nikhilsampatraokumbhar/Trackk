/**
 * End-to-End Data Flow Tests
 *
 * Tests complete real-world scenarios combining multiple services:
 * 1. SMS → Parse → Notification → Auto-detect → Save → Budget → Daily Spend
 * 2. Group creation → Add expense → Split → Settle → Debt recalculation
 * 3. Notification action → Group stash → Split review → Save
 * 4. Multi-group overall balance accuracy
 * 5. Backup → Restore → Verify data integrity
 * 6. Subscription detection → Match → Update cycle
 * 7. Multiple users with overlapping debts → simplification
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveTransaction,
  getTransactions,
  createGroup,
  addGroupTransaction,
  getGroupTransactions,
  settleSplit,
  removeSplitMember,
  saveGoal,
  getGoals,
  getOrCreateTodaySpend,
  computeTodaySpendFromTransactions,
  computeMonthSpendFromTransactions,
  saveSubscription,
  getSubscriptions,
  saveEMI,
  getEMIs,
  addSettlement,
  getSettlements,
  clearAllData,
  getGroups,
} from '../services/StorageService';
import { calculateDebts, getUserDebtSummary, simplifyDebts } from '../services/DebtCalculator';
import { parseTransactionSms } from '../services/TransactionParser';
import { classifyTransaction, processTransactionForTracking } from '../services/AutoDetectionService';
import { generateCSV, generateTextReport } from '../services/ExportService';
import { getBudgetStatus, setBudget, getOverallBudget } from '../services/BudgetService';
import { ParsedTransaction, SavingsGoal, GroupTransaction, EMIItem } from '../models/types';

beforeEach(() => {
  (AsyncStorage as any)._clear();
  jest.clearAllMocks();
});

const makeParsed = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
  amount: 500,
  type: 'debit',
  merchant: 'Test',
  rawMessage: 'Rs.500 debited at Test',
  timestamp: Date.now(),
  ...overrides,
});

// ─── Scenario 1: Full SMS → Budget Pipeline ─────────────────────────────────

describe('E2E: SMS → Parse → Save → Budget → Daily Spend', () => {
  it('should flow from SMS parsing through to daily budget impact', async () => {
    // Step 1: Set up savings goal with daily budget
    await saveGoal({
      id: 'g1', name: 'Save', targetAmount: 100000,
      targetDate: Date.now() + 365 * 86400000, targetMonths: 12,
      salary: 50000, emis: 0, expenses: 0, maintenance: 0,
      dailyBudget: 1000, monthlyBudget: 15000,
      streak: 0, lastStreakDate: '', savingsJar: 0, totalSaved: 0,
      createdAt: Date.now(),
    });

    // Step 2: Set up monthly budget
    await setBudget('overall', 30000);

    // Step 3: Parse SMS
    const sms1 = parseTransactionSms('Rs.250.00 debited from a/c XX1234 at Swiggy', 'AD-HDFCBK');
    const sms2 = parseTransactionSms('Rs.1500.00 debited from a/c XX1234 at BigBasket', 'AD-SBIBNK');

    expect(sms1).not.toBeNull();
    expect(sms2).not.toBeNull();

    // Step 4: Save transactions
    const txn1 = await saveTransaction(sms1!, 'personal', 'u1');
    const txn2 = await saveTransaction(sms2!, 'personal', 'u1');

    // Step 5: Verify daily spend
    const todaySpend = await computeTodaySpendFromTransactions();
    expect(todaySpend).toBe(1750);

    // Step 6: Verify daily budget impact
    const dailyEntry = await getOrCreateTodaySpend(1000);
    expect(dailyEntry.spent).toBe(1750);
    expect(dailyEntry.leftover).toBe(-750); // over budget

    // Step 7: Verify monthly budget status
    const budget = await getOverallBudget();
    const status = getBudgetStatus(budget!, 1750);
    expect(status.percentage).toBeCloseTo(5.83, 0);
    expect(status.state).toBe('safe');
  });
});

// ─── Scenario 2: Complete Group Expense Lifecycle ────────────────────────────

describe('E2E: Group Creation → Expenses → Settlement → Debt Resolution', () => {
  it('should track debts accurately through full group lifecycle', async () => {
    // Step 1: Create group with 3 members
    const group = await createGroup('Goa Trip', [
      { displayName: 'Alice', phone: '111' },
      { displayName: 'Bob', phone: '222' },
    ], 'user1');

    expect(group.members.length).toBe(3);

    // Step 2: User1 pays for dinner (₹3000, split 3 ways = ₹1000 each)
    const dinner = await addGroupTransaction(
      makeParsed({ amount: 3000, merchant: 'Restaurant' }),
      group.id, 'user1',
    );
    expect(dinner.splits.length).toBe(3);

    // Step 3: Alice pays for transport (₹600, split 3 ways = ₹200 each)
    const aliceId = group.members[1].userId;
    const transport = await addGroupTransaction(
      makeParsed({ amount: 600, merchant: 'Uber' }),
      group.id, aliceId,
    );

    // Step 4: Calculate debts
    let txns = await getGroupTransactions(group.id);
    let debts = calculateDebts(txns);

    // User1 paid 3000 (owed 2000), Alice paid 600 (owed 400)
    // Net: User1 = +2000 - 200 = +1800, Alice = +400 - 1000 = -600, Bob = -200 - 1000 = -1200
    const user1Summary = getUserDebtSummary(debts, 'user1');
    expect(user1Summary.totalOwed).toBeCloseTo(1800, 0);

    // Step 5: Bob settles with User1 (mark Bob's dinner split as settled)
    const bobId = group.members[2].userId;
    await settleSplit(group.id, dinner.id, bobId);

    // Step 6: Recalculate — Bob's debt to User1 should reduce
    txns = await getGroupTransactions(group.id);
    debts = calculateDebts(txns);
    const user1After = getUserDebtSummary(debts, 'user1');
    // Bob's ₹1000 dinner split is settled, but Bob still owes ₹200 for transport to Alice
    // So user1 is owed: ₹1000 (Alice's dinner) + 0 from Bob for dinner
    // But also owed ₹200 from Alice for transport? No — Alice paid transport
    // Recalc: user1 paid 3000 dinner. After settling Bob:
    //   Remaining unsettled: Alice owes user1 1000 (dinner)
    //   user1 owes Alice 200 (transport)
    //   Bob owes Alice 200 (transport)
    // Net user1: +1000 - 200 = +800
    expect(user1After.totalOwed - user1After.totalOwing).toBeCloseTo(800, 0);

    // Step 7: Record formal settlement
    await addSettlement({
      groupId: group.id,
      fromUserId: bobId,
      fromName: 'Bob',
      toUserId: 'user1',
      toName: 'You',
      amount: 1000,
      method: 'upi',
      note: 'Dinner settlement',
    });
    const settlements = await getSettlements(group.id);
    expect(settlements.length).toBe(1);
    expect(settlements[0].amount).toBe(1000);
  });
});

// ─── Scenario 3: Multi-Group Overall Balance ─────────────────────────────────

describe('E2E: Multi-Group Overall Balance', () => {
  it('should calculate correct total owed/owing across all groups', async () => {
    // Group 1: user1 is owed ₹500
    const g1 = await createGroup('Dinner', [
      { displayName: 'Alice', phone: '1' },
    ], 'user1');
    await addGroupTransaction(makeParsed({ amount: 1000 }), g1.id, 'user1');
    // user1 pays 1000, split 2 ways = 500 each. Alice owes user1 500.

    // Group 2: user1 owes ₹200
    const g2 = await createGroup('Lunch', [
      { displayName: 'Bob', phone: '2' },
    ], 'user1');
    const bobId = g2.members[1].userId;
    await addGroupTransaction(makeParsed({ amount: 400 }), g2.id, bobId);
    // Bob pays 400, split 2 ways = 200 each. user1 owes Bob 200.

    // Calculate overall balance
    const g1Txns = await getGroupTransactions(g1.id);
    const g2Txns = await getGroupTransactions(g2.id);
    const g1Debts = calculateDebts(g1Txns);
    const g2Debts = calculateDebts(g2Txns);

    const allDebts = [...g1Debts, ...g2Debts];
    const summary = getUserDebtSummary(allDebts, 'user1');

    expect(summary.totalOwed).toBeCloseTo(500, 0);
    expect(summary.totalOwing).toBeCloseTo(200, 0);
    // Net: user1 is net owed ₹300
    expect(summary.totalOwed - summary.totalOwing).toBeCloseTo(300, 0);
  });
});

// ─── Scenario 4: Auto-Detection Pipeline ────────────────────────────────────

describe('E2E: SMS Parse → Auto-Detect → Subscription/EMI Tracking', () => {
  it('should auto-detect Netflix subscription from SMS', async () => {
    const parsed = parseTransactionSms(
      'Rs.649.00 debited from a/c XX5678 for Netflix subscription renewal',
      'AD-HDFCBK',
    );
    expect(parsed).not.toBeNull();

    // Classify
    const classification = classifyTransaction(parsed!);
    expect(classification.category).toBe('subscription');
    expect(classification.matchedMerchant).toBe('Netflix');

    // Process for tracking
    const result = await processTransactionForTracking(parsed!);
    expect(result.type).toBe('subscription');
    expect(result.itemName).toBe('Netflix');

    const subs = await getSubscriptions();
    expect(subs.length).toBe(1);
    expect(subs[0].name).toBe('Netflix');
    expect(subs[0].amount).toBe(649);
  });

  it('should auto-detect EMI and track completion', async () => {
    // Pre-create EMI with 1 month left
    const emi: EMIItem = {
      id: 'emi1', name: 'Phone EMI', amount: 3000,
      totalMonths: 12, monthsPaid: 11, monthsLeft: 1,
      billingDay: 15, nextBillingDate: '2024-03-15',
      source: 'manual', confirmed: true, active: true,
      createdAt: Date.now(),
    };
    await saveEMI(emi);

    // Incoming EMI payment
    const parsed = makeParsed({
      amount: 3000,
      rawMessage: 'Rs.3000 EMI debited for Phone EMI',
      timestamp: new Date('2024-03-15').getTime(),
    });

    const result = await processTransactionForTracking(parsed);
    expect(result.emiCompleted).toBe(true);

    const emis = await getEMIs();
    expect(emis[0].active).toBe(false);
    expect(emis[0].monthsLeft).toBe(0);
    expect(emis[0].monthsPaid).toBe(12);
  });
});

// ─── Scenario 5: Export Accuracy ─────────────────────────────────────────────

describe('E2E: Transaction Data → Export → Verify Totals', () => {
  it('CSV export should have accurate totals matching stored transactions', async () => {
    const amounts = [123.45, 678.90, 234.56, 890.12, 45.67];
    for (const amount of amounts) {
      await saveTransaction(makeParsed({ amount }), 'personal', 'u1');
    }

    const txns = await getTransactions('personal');
    expect(txns.length).toBe(5);

    const csv = generateCSV(txns);
    const lines = csv.split('\n').slice(1); // skip header

    // Extract amounts from CSV — amounts are in the 4th column (index 3)
    // CSV fields may be quoted, so we need careful parsing
    const csvAmounts = lines.filter(l => l.trim()).map(line => {
      // The amount field (4th column) is not quoted and follows the quoted merchant
      // Format: date,"description","merchant",amount,"category","source",tracker,"tags","note"
      const match = line.match(/"\s*,(\d+\.\d{2}),"/);
      return match ? parseFloat(match[1]) : 0;
    });
    const csvTotal = csvAmounts.reduce((s, a) => s + a, 0);

    const expectedTotal = amounts.reduce((s, a) => s + a, 0);
    expect(csvTotal).toBeCloseTo(expectedTotal, 2);
  });

  it('text report should show correct transaction count and categories', async () => {
    const t1 = await saveTransaction(makeParsed({ amount: 100 }), 'personal', 'u1');
    const { updateTransaction } = require('../services/StorageService');
    await updateTransaction(t1.id, { category: 'Food' });
    const t2 = await saveTransaction(makeParsed({ amount: 200 }), 'personal', 'u1');
    await updateTransaction(t2.id, { category: 'Food' });
    const t3 = await saveTransaction(makeParsed({ amount: 300 }), 'personal', 'u1');
    await updateTransaction(t3.id, { category: 'Transport' });

    const txns = await getTransactions('personal');
    const report = generateTextReport(txns, 'March 2024');

    expect(report).toContain('Transactions: 3');
    expect(report).toContain('Food');
    expect(report).toContain('Transport');
  });
});

// ─── Scenario 6: Edge Case — Rapid Sequential Operations ────────────────────

describe('E2E: Rapid Sequential Operations', () => {
  it('should handle 20 sequential transactions without data loss', async () => {
    for (let i = 0; i < 20; i++) {
      await saveTransaction(
        makeParsed({ amount: i + 1 }),
        'personal',
        'u1',
      );
    }

    const txns = await getTransactions('personal');
    expect(txns.length).toBe(20);

    const total = txns.reduce((s, t) => s + t.amount, 0);
    const expected = (20 * 21) / 2; // sum of 1..20
    expect(total).toBe(expected);
  });

  it('should handle creating multiple groups and tracking debts across all', async () => {
    const groupIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const group = await createGroup(`Group ${i}`, [
        { displayName: `Member ${i}`, phone: `${i}` },
      ], 'user1');
      groupIds.push(group.id);
      await addGroupTransaction(
        makeParsed({ amount: (i + 1) * 100 }),
        group.id,
        'user1',
      );
    }

    // Verify each group has exactly 1 transaction
    for (let i = 0; i < 5; i++) {
      const txns = await getGroupTransactions(groupIds[i]);
      expect(txns.length).toBe(1);
      expect(txns[0].amount).toBe((i + 1) * 100);
    }

    // Verify total debts across all groups
    let totalOwed = 0;
    for (const gid of groupIds) {
      const txns = await getGroupTransactions(gid);
      const debts = calculateDebts(txns);
      const summary = getUserDebtSummary(debts, 'user1');
      totalOwed += summary.totalOwed;
    }
    // Each group: amount / 2 is owed (2 members)
    // Group 0: 50, Group 1: 100, Group 2: 150, Group 3: 200, Group 4: 250
    expect(totalOwed).toBeCloseTo(750, 0);
  });
});

// ─── Scenario 7: Complex Debt Simplification ─────────────────────────────────

describe('E2E: Complex 4-Person Group with Multiple Expenses', () => {
  it('should accurately simplify debts in a 4-person trip', async () => {
    const group = await createGroup('Bali Trip', [
      { displayName: 'Alice', phone: '1' },
      { displayName: 'Bob', phone: '2' },
      { displayName: 'Charlie', phone: '3' },
    ], 'user1');

    const [alice, bob, charlie] = group.members.slice(1);

    // user1 pays ₹4000 for hotel (split 4 ways = ₹1000 each)
    await addGroupTransaction(makeParsed({ amount: 4000, merchant: 'Hotel' }), group.id, 'user1');

    // Alice pays ₹2000 for food (split 4 ways = ₹500 each)
    await addGroupTransaction(makeParsed({ amount: 2000, merchant: 'Restaurant' }), group.id, alice.userId);

    // Bob pays ₹800 for transport (split 4 ways = ₹200 each)
    await addGroupTransaction(makeParsed({ amount: 800, merchant: 'Uber' }), group.id, bob.userId);

    const txns = await getGroupTransactions(group.id);
    const rawDebts = calculateDebts(txns);

    // Verify net balances:
    // user1: paid 4000, share = 1000+500+200 = 1700. Net = +2300
    // Alice: paid 2000, share = 1000+500+200 = 1700. Net = +300
    // Bob: paid 800, share = 1000+500+200 = 1700. Net = -900
    // Charlie: paid 0, share = 1000+500+200 = 1700. Net = -1700
    // Total: 2300 + 300 - 900 - 1700 = 0 ✓

    const user1Summary = getUserDebtSummary(rawDebts, 'user1');
    const aliceSummary = getUserDebtSummary(rawDebts, alice.userId);
    const bobSummary = getUserDebtSummary(rawDebts, bob.userId);
    const charlieSummary = getUserDebtSummary(rawDebts, charlie.userId);

    const user1Net = user1Summary.totalOwed - user1Summary.totalOwing;
    const aliceNet = aliceSummary.totalOwed - aliceSummary.totalOwing;
    const bobNet = bobSummary.totalOwed - bobSummary.totalOwing;
    const charlieNet = charlieSummary.totalOwed - charlieSummary.totalOwing;

    expect(user1Net).toBeCloseTo(2300, 0);
    expect(aliceNet).toBeCloseTo(300, 0);
    expect(bobNet).toBeCloseTo(-900, 0);
    expect(charlieNet).toBeCloseTo(-1700, 0);

    // Net should sum to 0
    expect(user1Net + aliceNet + bobNet + charlieNet).toBeCloseTo(0, 0);

    // Simplified debts should be fewer transfers
    const simplified = simplifyDebts(rawDebts);
    // Maximum transfers needed = 3 (n-1 for 4 people)
    expect(simplified.length).toBeLessThanOrEqual(3);

    // All simplified amounts should sum correctly
    const simplifiedTotal = simplified.reduce((s, d) => s + d.amount, 0);
    // Total money moving = 900 (Bob) + 1700 (Charlie) = 2600
    expect(simplifiedTotal).toBeCloseTo(2600, 0);
  });
});

// ─── Scenario 8: Full Clear & Verify ─────────────────────────────────────────

describe('E2E: Full Data Population → Clear → Verify Empty', () => {
  it('should leave no data residue after clearAllData', async () => {
    // Populate everything
    await saveTransaction(makeParsed({ amount: 100 }), 'personal', 'u1');
    await saveTransaction(makeParsed({ amount: 200 }), 'reimbursement', 'u1');
    const group = await createGroup('Test', [{ displayName: 'A', phone: '1' }], 'u1');
    await addGroupTransaction(makeParsed({ amount: 500 }), group.id, 'u1');
    await saveGoal({
      id: 'g1', name: 'Save', targetAmount: 100000,
      targetDate: Date.now(), targetMonths: 12,
      salary: 50000, emis: 0, expenses: 0, maintenance: 0,
      dailyBudget: 500, monthlyBudget: 15000,
      streak: 0, lastStreakDate: '', savingsJar: 0, totalSaved: 0,
      createdAt: Date.now(),
    });
    await setBudget('overall', 30000);
    await saveSubscription({
      id: 's1', name: 'Netflix', amount: 649, cycle: 'monthly',
      billingDay: 15, nextBillingDate: '2024-04-15', isShared: false,
      source: 'manual', confirmed: true, active: true, createdAt: Date.now(),
    });

    // Clear everything
    await clearAllData();

    // Verify all empty
    expect(await getTransactions()).toEqual([]);
    expect(await getGroups()).toEqual([]);
    expect(await getGoals()).toEqual([]);
    expect(await getGroupTransactions(group.id)).toEqual([]);
    expect(await getSubscriptions()).toEqual([]);
  });
});
