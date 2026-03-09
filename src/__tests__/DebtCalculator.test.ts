import { calculateDebts, getUserDebtSummary, simplifyDebts } from '../services/DebtCalculator';
import { GroupTransaction, Debt } from '../models/types';

function makeGroupTxn(overrides: Partial<GroupTransaction> = {}): GroupTransaction {
  return {
    id: 'txn1',
    groupId: 'g1',
    addedBy: 'user1',
    amount: 300,
    description: 'Test',
    timestamp: Date.now(),
    splits: [
      { userId: 'user1', displayName: 'Alice', amount: 100, settled: true },
      { userId: 'user2', displayName: 'Bob', amount: 100, settled: false },
      { userId: 'user3', displayName: 'Charlie', amount: 100, settled: false },
    ],
    ...overrides,
  };
}

describe('DebtCalculator', () => {
  describe('calculateDebts', () => {
    it('should return empty array for no transactions', () => {
      expect(calculateDebts([])).toEqual([]);
    });

    it('should calculate simple 3-way split', () => {
      const txns = [makeGroupTxn()];
      const debts = calculateDebts(txns);

      expect(debts.length).toBe(2);
      // Bob and Charlie each owe Alice 100
      const bobDebt = debts.find(d => d.fromUserId === 'user2');
      const charlieDebt = debts.find(d => d.fromUserId === 'user3');
      expect(bobDebt?.amount).toBe(100);
      expect(bobDebt?.toUserId).toBe('user1');
      expect(charlieDebt?.amount).toBe(100);
      expect(charlieDebt?.toUserId).toBe('user1');
    });

    it('should handle settled splits', () => {
      const txn = makeGroupTxn({
        splits: [
          { userId: 'user1', displayName: 'Alice', amount: 100, settled: true },
          { userId: 'user2', displayName: 'Bob', amount: 100, settled: true },
          { userId: 'user3', displayName: 'Charlie', amount: 100, settled: false },
        ],
      });
      const debts = calculateDebts([txn]);
      expect(debts.length).toBe(1);
      expect(debts[0].fromUserId).toBe('user3');
      expect(debts[0].amount).toBe(100);
    });

    it('should handle all settled', () => {
      const txn = makeGroupTxn({
        splits: [
          { userId: 'user1', displayName: 'Alice', amount: 100, settled: true },
          { userId: 'user2', displayName: 'Bob', amount: 100, settled: true },
          { userId: 'user3', displayName: 'Charlie', amount: 100, settled: true },
        ],
      });
      expect(calculateDebts([txn])).toEqual([]);
    });

    it('should simplify debts across multiple transactions', () => {
      // Alice pays 300 (each owes 100)
      const txn1 = makeGroupTxn();
      // Bob pays 300 (each owes 100)
      const txn2 = makeGroupTxn({
        id: 'txn2',
        addedBy: 'user2',
        splits: [
          { userId: 'user1', displayName: 'Alice', amount: 100, settled: false },
          { userId: 'user2', displayName: 'Bob', amount: 100, settled: true },
          { userId: 'user3', displayName: 'Charlie', amount: 100, settled: false },
        ],
      });

      const debts = calculateDebts([txn1, txn2]);
      // Net: Alice is owed 100 by Bob, 100 by Charlie from txn1
      //       Bob is owed 100 by Alice, 100 by Charlie from txn2
      // Net balance: Alice = +100-100 = 0, Bob = -100+100 = 0, Charlie = -200
      // Wait, recalculating:
      // txn1: Alice paid. Bob owes Alice 100. Charlie owes Alice 100.
      // txn2: Bob paid. Alice owes Bob 100. Charlie owes Bob 100.
      // Net: Alice = +200 - 100 = +100. Bob = -100 + 200 = +100. Charlie = -200.
      // Actually: Alice balance = +100 (from Bob) + 100 (from Charlie) - 100 (to Bob) = +100
      // Bob balance = -100 (to Alice) + 100 (from Alice) + 100 (from Charlie) = +100
      // Charlie balance = -100 (to Alice) - 100 (to Bob) = -200
      // So Charlie owes 100 to Alice and 100 to Bob
      expect(debts.length).toBe(2);
      const charlieDebts = debts.filter(d => d.fromUserId === 'user3');
      expect(charlieDebts.length).toBe(2);
      const totalCharlie = charlieDebts.reduce((sum, d) => sum + d.amount, 0);
      expect(totalCharlie).toBe(200);
    });

    it('should handle 2-person split correctly', () => {
      const txn = makeGroupTxn({
        amount: 200,
        splits: [
          { userId: 'user1', displayName: 'Alice', amount: 100, settled: true },
          { userId: 'user2', displayName: 'Bob', amount: 100, settled: false },
        ],
      });
      const debts = calculateDebts([txn]);
      expect(debts.length).toBe(1);
      expect(debts[0].fromUserId).toBe('user2');
      expect(debts[0].toUserId).toBe('user1');
      expect(debts[0].amount).toBe(100);
    });

    it('should handle rounding in amounts', () => {
      const txn = makeGroupTxn({
        amount: 100,
        splits: [
          { userId: 'user1', displayName: 'Alice', amount: 33.33, settled: true },
          { userId: 'user2', displayName: 'Bob', amount: 33.33, settled: false },
          { userId: 'user3', displayName: 'Charlie', amount: 33.34, settled: false },
        ],
      });
      const debts = calculateDebts([txn]);
      const totalDebt = debts.reduce((s, d) => s + d.amount, 0);
      expect(totalDebt).toBeCloseTo(66.67, 1);
    });
  });

  describe('getUserDebtSummary', () => {
    const debts: Debt[] = [
      { fromUserId: 'user2', fromName: 'Bob', toUserId: 'user1', toName: 'Alice', amount: 100 },
      { fromUserId: 'user3', fromName: 'Charlie', toUserId: 'user1', toName: 'Alice', amount: 50 },
      { fromUserId: 'user1', fromName: 'Alice', toUserId: 'user3', toName: 'Charlie', amount: 25 },
    ];

    it('should calculate totalOwed (money coming to user)', () => {
      const summary = getUserDebtSummary(debts, 'user1');
      expect(summary.totalOwed).toBe(150); // 100 from Bob + 50 from Charlie
    });

    it('should calculate totalOwing (money user owes)', () => {
      const summary = getUserDebtSummary(debts, 'user1');
      expect(summary.totalOwing).toBe(25); // 25 to Charlie
    });

    it('should return zero for user with no debts', () => {
      const summary = getUserDebtSummary(debts, 'user99');
      expect(summary.totalOwed).toBe(0);
      expect(summary.totalOwing).toBe(0);
    });
  });

  describe('simplifyDebts', () => {
    it('should consolidate opposing debts', () => {
      const debts: Debt[] = [
        { fromUserId: 'A', fromName: 'Alice', toUserId: 'B', toName: 'Bob', amount: 100 },
        { fromUserId: 'B', fromName: 'Bob', toUserId: 'A', toName: 'Alice', amount: 60 },
      ];
      const simplified = simplifyDebts(debts);
      // Net: A owes B 40
      expect(simplified.length).toBe(1);
      expect(simplified[0].fromUserId).toBe('A');
      expect(simplified[0].toUserId).toBe('B');
      expect(simplified[0].amount).toBe(40);
    });

    it('should return empty for balanced debts', () => {
      const debts: Debt[] = [
        { fromUserId: 'A', fromName: 'Alice', toUserId: 'B', toName: 'Bob', amount: 100 },
        { fromUserId: 'B', fromName: 'Bob', toUserId: 'A', toName: 'Alice', amount: 100 },
      ];
      const simplified = simplifyDebts(debts);
      expect(simplified.length).toBe(0);
    });
  });
});
