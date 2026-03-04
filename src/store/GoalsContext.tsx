import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FinancialProfile, SavingsGoal } from '../models/types';

const PROFILE_KEY = '@financial_profile';
const GOALS_KEY = '@savings_goals';

interface GoalsContextValue {
  profile: FinancialProfile | null;
  goals: SavingsGoal[];
  saveProfile: (p: FinancialProfile) => Promise<void>;
  createGoal: (
    name: string,
    targetAmount: number,
    deadlineMonth: number,
  ) => Promise<SavingsGoal | null>;
  resetGoal: (goalId: string) => Promise<void>;
  recordSpend: (amount: number) => Promise<void>; // called when a personal transaction is added
  activeGoal: SavingsGoal | null;
  // Derived values for the active goal
  dailyBudget: number;
  todayRemainingBudget: number;
  monthRemainingBudget: number;
  monthlySavings: number; // how much user will save per month
}

const GoalsContext = createContext<GoalsContextValue>({} as GoalsContextValue);

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function monthStartStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function daysInCurrentMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function GoalsProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<FinancialProfile | null>(null);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);

  // Load persisted data
  useEffect(() => {
    (async () => {
      const [pStr, gStr] = await Promise.all([
        AsyncStorage.getItem(PROFILE_KEY),
        AsyncStorage.getItem(GOALS_KEY),
      ]);
      if (pStr) setProfile(JSON.parse(pStr));
      if (gStr) setGoals(JSON.parse(gStr));
    })();
  }, []);

  const persistGoals = async (updated: SavingsGoal[]) => {
    setGoals(updated);
    await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(updated));
  };

  const saveProfile = async (p: FinancialProfile) => {
    setProfile(p);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  };

  /**
   * Create a new savings goal.
   * monthlyBudget = what's left after salary - EMIs - fixed - maintenance - misc
   * then subtract the required monthly savings to hit the target.
   * Whatever remains is the "discretionary budget" tracked through the app.
   */
  const createGoal = async (
    name: string,
    targetAmount: number,
    deadlineMonth: number,
  ): Promise<SavingsGoal | null> => {
    if (!profile) return null;

    const now = Date.now();
    const monthsLeft = Math.max(
      1,
      Math.round((deadlineMonth - now) / (1000 * 60 * 60 * 24 * 30)),
    );
    const requiredMonthlySavings = Math.ceil(targetAmount / monthsLeft);

    const fixedOutflow =
      profile.emiTotal +
      profile.fixedExpenses +
      profile.maintenanceAvg +
      profile.miscAvg;

    const monthlySavings = profile.salary - fixedOutflow;
    // The "monthly discretionary budget" is what they can spend on tracked (misc) expenses
    // so they still hit the savings target
    const monthlyBudget = Math.max(
      0,
      profile.miscAvg - Math.max(0, requiredMonthlySavings - (monthlySavings - requiredMonthlySavings > 0 ? 0 : 0)),
    );

    // Simpler: budget = salary - EMIs - fixed - maintenance - requiredMonthlySavings
    // What's left can be spent on anything tracked
    const computedMonthlyBudget = Math.max(
      0,
      profile.salary - profile.emiTotal - profile.fixedExpenses - profile.maintenanceAvg - requiredMonthlySavings,
    );

    const goal: SavingsGoal = {
      id: String(Date.now()),
      userId: '',
      name,
      targetAmount,
      deadlineMonth,
      createdAt: now,
      monthlyBudget: computedMonthlyBudget,
      streak: 0,
      lastStreakDate: '',
      todaySpent: 0,
      monthStartDate: monthStartStr(),
      monthBudgetUsed: 0,
    };

    const updated = [goal, ...goals];
    await persistGoals(updated);
    return goal;
  };

  /**
   * Reset a goal's streak and accumulated spend. Sets streak to 0.
   */
  const resetGoal = async (goalId: string) => {
    const updated = goals.map(g =>
      g.id === goalId
        ? {
            ...g,
            streak: 0,
            todaySpent: 0,
            monthBudgetUsed: 0,
            monthStartDate: monthStartStr(),
            lastStreakDate: '',
            resetAt: Date.now(),
          }
        : g,
    );
    await persistGoals(updated);
  };

  /**
   * Called whenever a personal/tracked expense is recorded.
   * Updates today's spend, monthly budget used, and streak.
   */
  const recordSpend = async (amount: number) => {
    if (goals.length === 0) return;

    const today = todayStr();
    const thisMonthStart = monthStartStr();

    const updated = goals.map(goal => {
      // Reset monthly tracking if it's a new month
      let { monthBudgetUsed, monthStartDate } = goal;
      if (monthStartDate !== thisMonthStart) {
        monthBudgetUsed = 0;
        monthStartDate = thisMonthStart;
      }

      // Reset today's spend if it's a new day
      let { todaySpent, streak, lastStreakDate } = goal;
      if (lastStreakDate !== today) {
        // Check if yesterday was within budget → extend streak
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);

        const dailyBudgetAmt = goal.monthlyBudget / daysInCurrentMonth();
        // If yesterday wasn't checked or was over budget, streak breaks
        if (lastStreakDate !== yesterdayStr) {
          // Streak broken (missed a day)
          streak = 0;
        }
        todaySpent = 0;
      }

      const newTodaySpent = todaySpent + amount;
      const newMonthUsed = monthBudgetUsed + amount;
      const dailyBudgetAmt = goal.monthlyBudget / daysInCurrentMonth();

      // Check streak: if today's spend crosses daily budget, reset streak
      // We evaluate streak at end of day in a real app, but here we update live
      let newStreak = streak;
      if (lastStreakDate !== today) {
        // First spend today — start or continue streak
        newStreak = streak + 1;
      }
      if (newTodaySpent > dailyBudgetAmt) {
        newStreak = 0;
      }

      return {
        ...goal,
        todaySpent: newTodaySpent,
        monthBudgetUsed: newMonthUsed,
        monthStartDate,
        streak: newStreak,
        lastStreakDate: today,
      };
    });

    await persistGoals(updated);
  };

  // Use the most recently created active goal
  const activeGoal = goals.length > 0 ? goals[0] : null;

  const dailyBudget = activeGoal
    ? activeGoal.monthlyBudget / daysInCurrentMonth()
    : 0;

  // Rolling: remaining = daily budget * days passed - month budget used + unused carry forward
  const dayOfMonth = new Date().getDate();
  const monthRemainingBudget = activeGoal
    ? activeGoal.monthlyBudget - activeGoal.monthBudgetUsed
    : 0;

  // Today's remaining = (budgeted so far this month - spent so far) + today's budget
  // Simplified: today's allowed = dailyBudget + (monthBudgetUsed underage from prev days)
  const budgetedSoFar = activeGoal ? dailyBudget * dayOfMonth : 0;
  const todayRemainingBudget = activeGoal
    ? budgetedSoFar - activeGoal.monthBudgetUsed
    : 0;

  const monthlySavings = profile
    ? profile.salary -
      profile.emiTotal -
      profile.fixedExpenses -
      profile.maintenanceAvg -
      profile.miscAvg
    : 0;

  return (
    <GoalsContext.Provider
      value={{
        profile,
        goals,
        saveProfile,
        createGoal,
        resetGoal,
        recordSpend,
        activeGoal,
        dailyBudget,
        todayRemainingBudget,
        monthRemainingBudget,
        monthlySavings,
      }}>
      {children}
    </GoalsContext.Provider>
  );
}

export function useGoals() {
  return useContext(GoalsContext);
}
