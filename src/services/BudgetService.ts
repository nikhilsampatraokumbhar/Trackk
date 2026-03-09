import AsyncStorage from '@react-native-async-storage/async-storage';
import { Budget } from '../models/types';
import { generateId } from '../utils/helpers';

const KEY = '@et_budgets';

export async function getBudgets(): Promise<Budget[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveBudgets(budgets: Budget[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(budgets));
}

export async function setBudget(category: string, amount: number): Promise<Budget> {
  const all = await getBudgets();
  const idx = all.findIndex(b => b.category === category);
  const budget: Budget = {
    id: idx !== -1 ? all[idx].id : generateId(),
    category,
    amount,
    period: 'monthly',
    createdAt: idx !== -1 ? all[idx].createdAt : Date.now(),
  };
  if (idx !== -1) all[idx] = budget;
  else all.push(budget);
  await saveBudgets(all);
  return budget;
}

export async function deleteBudget(category: string): Promise<void> {
  const all = await getBudgets();
  await saveBudgets(all.filter(b => b.category !== category));
}

export async function getOverallBudget(): Promise<Budget | null> {
  const all = await getBudgets();
  return all.find(b => b.category === 'overall') || null;
}

// ─── Threshold levels & witty copy ───────────────────────────────────────────

export type BudgetState = 'safe' | 'warning' | 'caution' | 'critical' | 'exceeded';

export interface BudgetStatus {
  budget: Budget;
  spent: number;
  percentage: number;
  state: BudgetState;
  color: string;
  message: string;
}

const WITTY_MESSAGES: Record<BudgetState, string[]> = {
  safe: [
    'Wallet says thanks 🙏',
    'Looking good, spender!',
    'Budget game strong 💪',
    'You\'re in the green zone',
  ],
  warning: [
    'Halfway there... watch it!',
    'Your wallet just raised an eyebrow',
    'Half the budget, whole month left 👀',
    '50% spent. Deep breaths.',
  ],
  caution: [
    'Your wallet is getting nervous',
    'Budget ki halat tight hai',
    '75% gone... choose wisely now',
    'Almost there... and not in a good way',
  ],
  critical: [
    'RED ALERT! Budget almost gone 🚨',
    'Wallet ne resignation de diya',
    '90% spent! Ramen diet incoming?',
    'Your budget is on life support',
  ],
  exceeded: [
    'Budget has left the chat 💀',
    'Overspent! Time to eat Maggi',
    'Your budget called. It\'s crying.',
    'Financial damage: maximum 😅',
    'Over-budget. Damage control time!',
  ],
};

export function getBudgetStatus(budget: Budget, spent: number): BudgetStatus {
  const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

  let state: BudgetState;
  let color: string;
  if (percentage >= 100) {
    state = 'exceeded';
    color = '#E0505E';
  } else if (percentage >= 90) {
    state = 'critical';
    color = '#E0505E';
  } else if (percentage >= 75) {
    state = 'caution';
    color = '#E8A84A';
  } else if (percentage >= 50) {
    state = 'warning';
    color = '#E8C06A';
  } else {
    state = 'safe';
    color = '#3CB882';
  }

  const msgs = WITTY_MESSAGES[state];
  const message = msgs[Math.floor(Math.random() * msgs.length)];

  return { budget, spent, percentage, state, color, message };
}
