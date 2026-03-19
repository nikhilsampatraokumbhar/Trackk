import { GroupTransaction, Debt } from '../models/types';

export function calculateDebts(transactions: GroupTransaction[]): Debt[] {
  // Group transactions by currency, then calculate debts per currency
  const txnsByCurrency: Record<string, GroupTransaction[]> = {};

  for (const txn of transactions) {
    const currency = txn.currency || 'INR';
    if (!txnsByCurrency[currency]) txnsByCurrency[currency] = [];
    txnsByCurrency[currency].push(txn);
  }

  const allDebts: Debt[] = [];

  for (const [currency, txns] of Object.entries(txnsByCurrency)) {
    const balances: Record<string, { name: string; balance: number }> = {};

    for (const txn of txns) {
      // Ensure payer exists in balances even if not in the split list
      if (!balances[txn.addedBy]) {
        const payerSplit = txn.splits.find(s => s.userId === txn.addedBy);
        balances[txn.addedBy] = { name: payerSplit?.displayName || 'Unknown', balance: 0 };
      }

      for (const split of txn.splits) {
        if (!balances[split.userId]) {
          balances[split.userId] = { name: split.displayName, balance: 0 };
        }

        // Skip payer's own split (they paid, so their portion is settled)
        if (split.userId === txn.addedBy) continue;

        if (!split.settled) {
          // Non-payer owes this amount
          balances[split.userId].balance -= split.amount;
          // Payer is owed this amount
          balances[txn.addedBy].balance += split.amount;
        }
      }
    }

    const debts = simplifyBalances(balances, currency === 'INR' ? undefined : currency);
    allDebts.push(...debts);
  }

  return allDebts;
}

function simplifyBalances(
  balances: Record<string, { name: string; balance: number }>,
  currency?: string,
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
        currency,
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
 * Groups debts by currency before simplifying.
 */
export function simplifyDebts(debts: Debt[]): Debt[] {
  // Group by currency
  const debtsByCurrency: Record<string, Debt[]> = {};
  for (const d of debts) {
    const currency = d.currency || 'INR';
    if (!debtsByCurrency[currency]) debtsByCurrency[currency] = [];
    debtsByCurrency[currency].push(d);
  }

  const allSimplified: Debt[] = [];

  for (const [currency, currencyDebts] of Object.entries(debtsByCurrency)) {
    const balances: Record<string, { name: string; balance: number }> = {};
    for (const d of currencyDebts) {
      if (!balances[d.fromUserId]) balances[d.fromUserId] = { name: d.fromName, balance: 0 };
      if (!balances[d.toUserId]) balances[d.toUserId] = { name: d.toName, balance: 0 };
      balances[d.fromUserId].balance -= d.amount;
      balances[d.toUserId].balance += d.amount;
    }
    allSimplified.push(...simplifyBalances(balances, currency === 'INR' ? undefined : currency));
  }

  return allSimplified;
}
