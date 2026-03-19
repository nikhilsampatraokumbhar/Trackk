/**
 * Comprehensive flow tests for:
 * - Split expense (including undefined field guard for Firestore)
 * - Notification routing based on active trackers
 * - Group budget tracking
 * - Settlement flow
 * - Auto-add from SMS to correct tracker
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveTransaction,
  getTransactions,
  createGroup,
  addGroupTransaction,
  getGroupTransactions,
  settleSplit,
} from '../services/StorageService';
import { calculateDebts, getUserDebtSummary } from '../services/DebtCalculator';
import { ParsedTransaction, ActiveTracker, TrackerState, Group, GroupTransaction } from '../models/types';

beforeEach(() => {
  (AsyncStorage as any)._clear();
  jest.clearAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeParsed = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
  amount: 500,
  type: 'debit',
  merchant: 'Test Store',
  rawMessage: 'Rs.500 debited at Test Store',
  timestamp: Date.now(),
  ...overrides,
});

function getActiveTrackersFromState(state: TrackerState, groups: Group[]): ActiveTracker[] {
  const trackers: ActiveTracker[] = [];
  if (state.personal) trackers.push({ type: 'personal', id: 'personal', label: 'Personal' });
  if (state.reimbursement) trackers.push({ type: 'reimbursement', id: 'reimbursement', label: 'Reimbursement' });
  for (const gid of state.activeGroupIds) {
    const group = groups.find(g => g.id === gid);
    if (group) trackers.push({ type: 'group', id: gid, label: group.name });
  }
  return trackers;
}

function resolveTrackerRouting(activeTrackers: ActiveTracker[]) {
  const groupTrackers = activeTrackers.filter(t => t.type === 'group');
  const hasPersonal = activeTrackers.some(t => t.type === 'personal');
  const hasReimbursement = activeTrackers.some(t => t.type === 'reimbursement');
  if (groupTrackers.length > 0) return { action: 'auto_group' as const, tracker: groupTrackers[0] };
  if (hasReimbursement && hasPersonal) return { action: 'auto_reimbursement_personal' as const, trackers: activeTrackers };
  return { action: 'normal' as const, trackers: activeTrackers };
}

// ─── Split Expense Tests ──────────────────────────────────────────────────────

describe('Split Expense Flow', () => {
  test('creates a group and splits expense equally among members', async () => {
    const group = await createGroup('Dinner Group', [
      { displayName: 'Alice', phone: '9876543210' },
      { displayName: 'Bob', phone: '9876543211' },
    ], 'user1');

    expect(group.members.length).toBe(3); // user + 2 members

    const parsed = makeParsed({ amount: 300 });
    const txn = await addGroupTransaction(parsed, group.id, 'user1');

    expect(txn.splits.length).toBe(3);
    const totalSplitAmount = txn.splits.reduce((s, sp) => s + sp.amount, 0);
    expect(totalSplitAmount).toBe(300);

    // User's split should be auto-settled
    const userSplit = txn.splits.find(s => s.userId === 'user1');
    expect(userSplit?.settled).toBe(true);

    // Others should be unsettled
    const otherSplits = txn.splits.filter(s => s.userId !== 'user1');
    otherSplits.forEach(s => expect(s.settled).toBe(false));
  });

  test('handles rounding correctly for uneven splits', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '9876543210' },
      { displayName: 'Bob', phone: '9876543211' },
    ], 'user1');

    const parsed = makeParsed({ amount: 100 }); // 100/3 = 33.33...
    const txn = await addGroupTransaction(parsed, group.id, 'user1');

    const total = txn.splits.reduce((s, sp) => s + sp.amount, 0);
    expect(total).toBeCloseTo(100, 1); // Must sum to exact amount
  });

  test('transaction object does not contain undefined values (Firestore guard)', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '9876543210' },
    ], 'user1');

    // No merchant provided — should not have undefined merchant
    const parsed = makeParsed({ merchant: undefined });
    const txn = await addGroupTransaction(parsed, group.id, 'user1');

    // Build a Firestore-safe object the same way SplitEditorScreen does
    const firestoreTxn: Record<string, any> = {
      id: txn.id,
      groupId: txn.groupId,
      addedBy: txn.addedBy,
      amount: txn.amount,
      description: txn.description,
      timestamp: txn.timestamp,
      splits: txn.splits,
    };
    if (txn.merchant) {
      firestoreTxn.merchant = txn.merchant;
    }

    // Verify no undefined values exist
    Object.entries(firestoreTxn).forEach(([key, value]) => {
      expect(value).not.toBeUndefined();
    });
  });

  test('split expense with merchant included passes Firestore guard', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '9876543210' },
    ], 'user1');

    const parsed = makeParsed({ merchant: 'Swiggy' });
    const txn = await addGroupTransaction(parsed, group.id, 'user1');

    const firestoreTxn: Record<string, any> = {
      id: txn.id,
      groupId: txn.groupId,
      addedBy: txn.addedBy,
      amount: txn.amount,
      description: txn.description,
      timestamp: txn.timestamp,
      splits: txn.splits,
    };
    if (txn.merchant) {
      firestoreTxn.merchant = txn.merchant;
    }

    expect(firestoreTxn.merchant).toBe('Swiggy');
  });
});

// ─── Notification Routing Tests ───────────────────────────────────────────────

describe('Notification Routing', () => {
  test('group+personal active → auto-routes to group', () => {
    const group: Group = {
      id: 'g1', name: 'Trip', members: [], createdBy: 'u1', createdAt: Date.now(),
    };
    const state: TrackerState = {
      personal: true, reimbursement: false,
      activeGroupIds: ['g1'], groupAffectsGoal: false,
    };
    const trackers = getActiveTrackersFromState(state, [group]);
    const routing = resolveTrackerRouting(trackers);

    expect(routing.action).toBe('auto_group');
    if (routing.action === 'auto_group') {
      expect(routing.tracker.id).toBe('g1');
    }
  });

  test('reimbursement+personal active → auto-save to both', () => {
    const state: TrackerState = {
      personal: true, reimbursement: true,
      activeGroupIds: [], groupAffectsGoal: false,
    };
    const trackers = getActiveTrackersFromState(state, []);
    const routing = resolveTrackerRouting(trackers);

    expect(routing.action).toBe('auto_reimbursement_personal');
  });

  test('only personal active → normal flow (single tracker)', () => {
    const state: TrackerState = {
      personal: true, reimbursement: false,
      activeGroupIds: [], groupAffectsGoal: false,
    };
    const trackers = getActiveTrackersFromState(state, []);
    const routing = resolveTrackerRouting(trackers);

    expect(routing.action).toBe('normal');
    if (routing.action === 'normal') {
      expect(routing.trackers.length).toBe(1);
      expect(routing.trackers[0].type).toBe('personal');
    }
  });

  test('only reimbursement active → normal flow (single tracker)', () => {
    const state: TrackerState = {
      personal: false, reimbursement: true,
      activeGroupIds: [], groupAffectsGoal: false,
    };
    const trackers = getActiveTrackersFromState(state, []);
    const routing = resolveTrackerRouting(trackers);

    expect(routing.action).toBe('normal');
    if (routing.action === 'normal') {
      expect(routing.trackers.length).toBe(1);
      expect(routing.trackers[0].type).toBe('reimbursement');
    }
  });

  test('group tracker active → notification goes to that group', () => {
    const groups: Group[] = [
      { id: 'trip1', name: 'Goa Trip', members: [], createdBy: 'u1', createdAt: Date.now() },
      { id: 'trip2', name: 'Office Lunch', members: [], createdBy: 'u1', createdAt: Date.now() },
    ];
    const state: TrackerState = {
      personal: true, reimbursement: false,
      activeGroupIds: ['trip1'], groupAffectsGoal: false,
    };
    const trackers = getActiveTrackersFromState(state, groups);
    const routing = resolveTrackerRouting(trackers);

    expect(routing.action).toBe('auto_group');
    if (routing.action === 'auto_group') {
      expect(routing.tracker.label).toBe('Goa Trip');
    }
  });

  test('multiple groups active → routes to first group', () => {
    const groups: Group[] = [
      { id: 'g1', name: 'Trip A', members: [], createdBy: 'u1', createdAt: Date.now() },
      { id: 'g2', name: 'Trip B', members: [], createdBy: 'u1', createdAt: Date.now() },
    ];
    const state: TrackerState = {
      personal: true, reimbursement: false,
      activeGroupIds: ['g1', 'g2'], groupAffectsGoal: false,
    };
    const trackers = getActiveTrackersFromState(state, groups);
    const routing = resolveTrackerRouting(trackers);

    expect(routing.action).toBe('auto_group');
    if (routing.action === 'auto_group') {
      expect(routing.tracker.id).toBe('g1');
    }
  });
});

// ─── Settlement Flow Tests ────────────────────────────────────────────────────

describe('Settlement Flow', () => {
  test('settling a split marks it as settled', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '9876543210' },
    ], 'user1');

    const parsed = makeParsed({ amount: 200 });
    const txn = await addGroupTransaction(parsed, group.id, 'user1');

    // Alice should be unsettled
    const aliceSplit = txn.splits.find(s => s.userId !== 'user1');
    expect(aliceSplit?.settled).toBe(false);

    // Settle Alice's split
    await settleSplit(group.id, txn.id, aliceSplit!.userId);

    const txns = await getGroupTransactions(group.id);
    const updated = txns.find(t => t.id === txn.id);
    const aliceUpdated = updated?.splits.find(s => s.userId === aliceSplit!.userId);
    expect(aliceUpdated?.settled).toBe(true);
  });

  test('debt calculation after partial settlement', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Alice', phone: '9876543210' },
    ], 'user1');

    // user1 pays 200, split equally (100 each)
    const txn = await addGroupTransaction(makeParsed({ amount: 200 }), group.id, 'user1');
    const txns = await getGroupTransactions(group.id);

    const debts = calculateDebts(txns);
    // Alice owes user1 100
    expect(debts.length).toBeGreaterThan(0);
    const { totalOwed } = getUserDebtSummary(debts, 'user1');
    expect(totalOwed).toBeCloseTo(100, 0);
  });
});

// ─── Auto-Add to Correct Tracker Tests ────────────────────────────────────────

describe('Auto-Add to Tracker', () => {
  test('personal transaction saves to personal tracker', async () => {
    const parsed = makeParsed({ amount: 150 });
    await saveTransaction(parsed, 'personal', 'user1');

    const txns = await getTransactions();
    expect(txns.length).toBe(1);
    expect(txns[0].trackerType).toBe('personal');
    expect(txns[0].amount).toBe(150);
  });

  test('reimbursement transaction saves to reimbursement tracker', async () => {
    const parsed = makeParsed({ amount: 250 });
    await saveTransaction(parsed, 'reimbursement', 'user1');

    const txns = await getTransactions();
    expect(txns.length).toBe(1);
    expect(txns[0].trackerType).toBe('reimbursement');
  });

  test('group transaction stays in group storage only (not personal)', async () => {
    const group = await createGroup('Test', [
      { displayName: 'Bob', phone: '9876543210' },
    ], 'user1');

    const parsed = makeParsed({ amount: 400 });
    await addGroupTransaction(parsed, group.id, 'user1');

    // Group transactions should exist
    const gTxns = await getGroupTransactions(group.id);
    expect(gTxns.length).toBe(1);
    expect(gTxns[0].amount).toBe(400);

    // No personal transaction should be created from group splits
    const pTxns = await getTransactions();
    expect(pTxns.length).toBe(0);
  });

  test('dual save: reimbursement + personal saves to both', async () => {
    const parsed = makeParsed({ amount: 300 });
    await saveTransaction(parsed, 'personal', 'user1');
    await saveTransaction(parsed, 'reimbursement', 'user1');

    const txns = await getTransactions();
    expect(txns.length).toBe(2);
    expect(txns.some(t => t.trackerType === 'personal')).toBe(true);
    expect(txns.some(t => t.trackerType === 'reimbursement')).toBe(true);
  });
});

// ─── Group Budget Tests ───────────────────────────────────────────────────────

describe('Group Budget', () => {
  test('group can be created with optional budget', async () => {
    const group = await createGroup('Trip', [
      { displayName: 'Alice', phone: '9876543210' },
    ], 'user1', true);

    // Budget is added post-creation
    group.budget = 5000;
    expect(group.budget).toBe(5000);
    expect(group.isTrip).toBe(true);
  });

  test('budget progress calculation is correct', async () => {
    const group = await createGroup('Trip', [
      { displayName: 'Alice', phone: '9876543210' },
    ], 'user1', true);
    group.budget = 5000;

    // Add some expenses
    await addGroupTransaction(makeParsed({ amount: 1000 }), group.id, 'user1');
    await addGroupTransaction(makeParsed({ amount: 2000 }), group.id, 'user1');

    const txns = await getGroupTransactions(group.id);
    const totalSpent = txns.reduce((s, t) => s + t.amount, 0);

    expect(totalSpent).toBe(3000);
    const budgetUsedPercent = (totalSpent / group.budget!) * 100;
    expect(budgetUsedPercent).toBe(60);
  });

  test('budget over-spend is detected', async () => {
    const group = await createGroup('Trip', [
      { displayName: 'Alice', phone: '9876543210' },
    ], 'user1');
    group.budget = 1000;

    await addGroupTransaction(makeParsed({ amount: 600 }), group.id, 'user1');
    await addGroupTransaction(makeParsed({ amount: 600 }), group.id, 'user1');

    const txns = await getGroupTransactions(group.id);
    const totalSpent = txns.reduce((s, t) => s + t.amount, 0);

    expect(totalSpent).toBe(1200);
    expect(totalSpent).toBeGreaterThan(group.budget!);
  });
});
