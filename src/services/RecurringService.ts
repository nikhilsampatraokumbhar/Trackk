import { Transaction } from '../models/types';

export interface RecurringExpense {
  merchant: string;
  avgAmount: number;
  frequency: 'weekly' | 'monthly';
  occurrences: number;
  lastDate: number;
  totalSpent: number;
}

/**
 * Detects recurring expenses by analyzing transaction patterns.
 * Looks for merchants/descriptions that appear 3+ times with regular intervals.
 */
export function detectRecurringExpenses(transactions: Transaction[]): RecurringExpense[] {
  // Group by normalized merchant/description
  const groups: Record<string, Transaction[]> = {};
  for (const txn of transactions) {
    const key = (txn.merchant || txn.description).toLowerCase().trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(txn);
  }

  const recurring: RecurringExpense[] = [];

  for (const [merchant, txns] of Object.entries(groups)) {
    if (txns.length < 3) continue;

    // Sort by timestamp
    const sorted = txns.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate intervals between consecutive transactions
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days = (sorted[i].timestamp - sorted[i - 1].timestamp) / (1000 * 60 * 60 * 24);
      intervals.push(days);
    }

    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const totalSpent = txns.reduce((s, t) => s + t.amount, 0);
    const avgAmount = totalSpent / txns.length;

    // Check if intervals are somewhat regular (std dev < 40% of mean)
    const variance = intervals.reduce((s, v) => s + Math.pow(v - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgInterval > 0 ? stdDev / avgInterval : Infinity;

    if (coefficientOfVariation > 0.5) continue; // Too irregular

    let frequency: 'weekly' | 'monthly';
    if (avgInterval >= 5 && avgInterval <= 10) {
      frequency = 'weekly';
    } else if (avgInterval >= 20 && avgInterval <= 40) {
      frequency = 'monthly';
    } else {
      continue; // Not a recognizable pattern
    }

    // Capitalize merchant name properly
    const displayName = merchant.charAt(0).toUpperCase() + merchant.slice(1);

    recurring.push({
      merchant: displayName,
      avgAmount: Math.round(avgAmount * 100) / 100,
      frequency,
      occurrences: txns.length,
      lastDate: sorted[sorted.length - 1].timestamp,
      totalSpent: Math.round(totalSpent * 100) / 100,
    });
  }

  return recurring.sort((a, b) => b.totalSpent - a.totalSpent);
}
