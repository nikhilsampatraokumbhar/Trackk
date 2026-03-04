import { GroupTransaction, Debt } from '../models/types';

export function calculateDebts(transactions: GroupTransaction[]): Debt[] {
  const balances: Record<string, { name: string; balance: number }> = {};

  for (const txn of transactions) {
    for (const split of txn.splits) {
      if (!balances[split.userId]) {
        balances[split.userId] = { name: split.displayName, balance: 0 };
      }

      if (!split.settled) {
        // Person who paid (addedBy) gets credited, others get debited
        if (split.userId === txn.addedBy) {
          // Payer is settled for their own split; net them out from others
          balances[split.userId].balance += (txn.amount - split.amount);
        } else {
          balances[split.userId].balance -= split.amount;
        }
      }
    }
  }

  return simplifyBalances(balances);
}

function simplifyBalances(
  balances: Record<string, { name: string; balance: number }>
): Debt[] {
  const debts: Debt[] = [];
  const entries = Object.entries(balances).map(([id, { name, balance }]) => ({
    id,
    name,
    balance,
  }));

  const creditors = entries.filter(e => e.balance > 0.01);
  const debtors = entries.filter(e => e.balance < -0.01);

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.balance, -debtor.balance);

    if (amount > 0.01) {
      debts.push({
        fromUserId: debtor.id,
        fromName: debtor.name,
        toUserId: creditor.id,
        toName: creditor.name,
        amount: Math.round(amount * 100) / 100,
      });
    }

    creditor.balance -= amount;
    debtor.balance += amount;

    if (creditor.balance < 0.01) ci++;
    if (debtor.balance > -0.01) di++;
  }

  return debts;
}

export function getUserDebtSummary(
  debts: Debt[],
  userId: string
): { totalOwed: number; totalOwing: number } {
  let totalOwed = 0;
  let totalOwing = 0;

  for (const debt of debts) {
    if (debt.toUserId === userId) totalOwed += debt.amount;
    if (debt.fromUserId === userId) totalOwing += debt.amount;
  }

  return { totalOwed, totalOwing };
}

/**
 * Takes an array of debts and returns a simplified (consolidated) version.
 * If debts are already simplified (e.g. from calculateDebts), returns as-is.
 */
export function simplifyDebts(debts: Debt[]): Debt[] {
  // Build net balances from the debt list
  const balances: Record<string, { name: string; balance: number }> = {};
  for (const d of debts) {
    if (!balances[d.fromUserId]) balances[d.fromUserId] = { name: d.fromName, balance: 0 };
    if (!balances[d.toUserId]) balances[d.toUserId] = { name: d.toName, balance: 0 };
    balances[d.fromUserId].balance -= d.amount;
    balances[d.toUserId].balance += d.amount;
  }
  return simplifyBalances(balances);
}
