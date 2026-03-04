import { GroupTransaction, Debt } from '../models/types';

/**
 * Debt Calculator
 *
 * Given a list of group transactions with splits, calculates the simplified
 * net debts between members. Uses a "min-cash-flow" approach:
 *
 * 1. Calculate net balance for each person (positive = owed money, negative = owes money)
 * 2. Match the person who owes the most with the person who is owed the most
 * 3. Settle the minimum of the two amounts
 * 4. Repeat until all balances are zero
 *
 * This minimizes the number of payments needed to settle all debts.
 */

interface Balance {
  userId: string;
  displayName: string;
  amount: number; // positive = is owed, negative = owes
}

/**
 * Calculate simplified debts for a group from its transactions.
 */
export function calculateDebts(transactions: GroupTransaction[]): Debt[] {
  // Step 1: Build net balance map
  const balanceMap = new Map<string, Balance>();

  for (const txn of transactions) {
    // The person who paid is owed by everyone else
    const payerId = txn.addedBy;

    for (const split of txn.splits) {
      // Initialize balance entries
      if (!balanceMap.has(split.userId)) {
        balanceMap.set(split.userId, {
          userId: split.userId,
          displayName: split.displayName,
          amount: 0,
        });
      }

      if (split.userId === payerId) {
        // Payer is owed the total minus their own share
        // (we add amounts from other splits to their balance)
        continue;
      }

      if (!split.settled) {
        // This person owes `split.amount` to the payer
        const ownerBalance = balanceMap.get(split.userId)!;
        ownerBalance.amount -= split.amount;

        // The payer is owed this amount
        if (!balanceMap.has(payerId)) {
          // Find payer's display name from splits
          const payerSplit = txn.splits.find(s => s.userId === payerId);
          balanceMap.set(payerId, {
            userId: payerId,
            displayName: payerSplit?.displayName || 'Unknown',
            amount: 0,
          });
        }
        const payerBalance = balanceMap.get(payerId)!;
        payerBalance.amount += split.amount;
      }
    }
  }

  // Step 2: Simplify debts using min-cash-flow algorithm
  const balances = Array.from(balanceMap.values()).filter(b =>
    Math.abs(b.amount) > 0.01,
  );

  return simplifyDebts(balances);
}

/**
 * Min-cash-flow algorithm to reduce the number of transactions.
 */
function simplifyDebts(balances: Balance[]): Debt[] {
  const debts: Debt[] = [];

  // Sort: those who owe (negative) first, those who are owed (positive) last
  const debtors = balances
    .filter(b => b.amount < -0.01)
    .sort((a, b) => a.amount - b.amount); // most negative first

  const creditors = balances
    .filter(b => b.amount > 0.01)
    .sort((a, b) => b.amount - a.amount); // most positive first

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const settleAmount = Math.min(Math.abs(debtor.amount), creditor.amount);

    if (settleAmount > 0.01) {
      debts.push({
        fromUserId: debtor.userId,
        fromName: debtor.displayName,
        toUserId: creditor.userId,
        toName: creditor.displayName,
        amount: Math.round(settleAmount * 100) / 100,
      });
    }

    debtor.amount += settleAmount;
    creditor.amount -= settleAmount;

    if (Math.abs(debtor.amount) < 0.01) i++;
    if (Math.abs(creditor.amount) < 0.01) j++;
  }

  return debts;
}

/**
 * Get the total amount a specific user owes or is owed in a group.
 */
export function getUserDebtSummary(
  debts: Debt[],
  userId: string,
): { totalOwed: number; totalOwing: number; net: number } {
  let totalOwed = 0; // others owe this user
  let totalOwing = 0; // this user owes others

  for (const debt of debts) {
    if (debt.toUserId === userId) {
      totalOwed += debt.amount;
    }
    if (debt.fromUserId === userId) {
      totalOwing += debt.amount;
    }
  }

  return {
    totalOwed: Math.round(totalOwed * 100) / 100,
    totalOwing: Math.round(totalOwing * 100) / 100,
    net: Math.round((totalOwed - totalOwing) * 100) / 100,
  };
}

/**
 * Format a debt for display.
 */
export function formatDebt(debt: Debt): string {
  return `${debt.fromName} owes ${debt.toName} ₹${debt.amount.toLocaleString('en-IN')}`;
}
