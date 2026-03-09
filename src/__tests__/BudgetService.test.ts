import { getBudgets, setBudget, deleteBudget, getOverallBudget, getBudgetStatus } from '../services/BudgetService';
import { Budget } from '../models/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Reset storage before each test
beforeEach(() => {
  (AsyncStorage as any)._clear();
  jest.clearAllMocks();
});

describe('BudgetService', () => {
  describe('getBudgets', () => {
    it('should return empty array when no budgets exist', async () => {
      const result = await getBudgets();
      expect(result).toEqual([]);
    });

    it('should return stored budgets', async () => {
      const budget: Budget = { id: '1', category: 'food', amount: 5000, period: 'monthly', createdAt: Date.now() };
      await AsyncStorage.setItem('@et_budgets', JSON.stringify([budget]));
      const result = await getBudgets();
      expect(result.length).toBe(1);
      expect(result[0].category).toBe('food');
    });
  });

  describe('setBudget', () => {
    it('should create a new budget', async () => {
      const result = await setBudget('food', 5000);
      expect(result.category).toBe('food');
      expect(result.amount).toBe(5000);
      expect(result.period).toBe('monthly');
      expect(result.id).toBeTruthy();
    });

    it('should update existing budget for same category', async () => {
      await setBudget('food', 5000);
      const updated = await setBudget('food', 8000);
      expect(updated.amount).toBe(8000);

      const all = await getBudgets();
      expect(all.length).toBe(1); // should not duplicate
    });

    it('should allow multiple categories', async () => {
      await setBudget('food', 5000);
      await setBudget('transport', 2000);
      const all = await getBudgets();
      expect(all.length).toBe(2);
    });
  });

  describe('deleteBudget', () => {
    it('should delete a budget by category', async () => {
      await setBudget('food', 5000);
      await deleteBudget('food');
      const all = await getBudgets();
      expect(all.length).toBe(0);
    });

    it('should not error when deleting non-existent budget', async () => {
      await expect(deleteBudget('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('getOverallBudget', () => {
    it('should return null when no overall budget exists', async () => {
      const result = await getOverallBudget();
      expect(result).toBeNull();
    });

    it('should return overall budget when set', async () => {
      await setBudget('overall', 50000);
      const result = await getOverallBudget();
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(50000);
    });
  });

  describe('getBudgetStatus', () => {
    const budget: Budget = { id: '1', category: 'overall', amount: 10000, period: 'monthly', createdAt: Date.now() };

    it('should return "safe" for 0-49% spent', () => {
      const status = getBudgetStatus(budget, 3000);
      expect(status.state).toBe('safe');
      expect(status.percentage).toBe(30);
      expect(status.color).toBe('#3CB882');
    });

    it('should return "warning" for 50-74% spent', () => {
      const status = getBudgetStatus(budget, 6000);
      expect(status.state).toBe('warning');
      expect(status.percentage).toBe(60);
    });

    it('should return "caution" for 75-89% spent', () => {
      const status = getBudgetStatus(budget, 8000);
      expect(status.state).toBe('caution');
      expect(status.percentage).toBe(80);
    });

    it('should return "critical" for 90-99% spent', () => {
      const status = getBudgetStatus(budget, 9500);
      expect(status.state).toBe('critical');
      expect(status.percentage).toBe(95);
    });

    it('should return "exceeded" for 100%+ spent', () => {
      const status = getBudgetStatus(budget, 12000);
      expect(status.state).toBe('exceeded');
      expect(status.percentage).toBe(120);
    });

    it('should handle zero budget gracefully', () => {
      const zeroBudget = { ...budget, amount: 0 };
      const status = getBudgetStatus(zeroBudget, 100);
      expect(status.percentage).toBe(0);
      expect(status.state).toBe('safe');
    });

    it('should include a witty message', () => {
      const status = getBudgetStatus(budget, 5000);
      expect(status.message).toBeTruthy();
      expect(status.message.length).toBeGreaterThan(0);
    });

    it('should include budget and spent in result', () => {
      const status = getBudgetStatus(budget, 5000);
      expect(status.budget).toBe(budget);
      expect(status.spent).toBe(5000);
    });
  });
});
