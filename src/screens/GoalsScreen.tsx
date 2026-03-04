import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { SavingsGoal } from '../models/types';
import { getGoals, saveGoal, deleteGoal, getTodaySpend, getMonthSpend } from '../services/StorageService';
import { COLORS, formatCurrency, generateId } from '../utils/helpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12
    + (to.getMonth() - from.getMonth());
  return Math.max(months, 1);
}

function monthsElapsed(createdAt: number, targetDate: number): number {
  const start = new Date(createdAt);
  const now = new Date();
  const end = new Date(targetDate);
  const total = monthsBetween(start, end);
  const elapsed = monthsBetween(start, now);
  return Math.min(elapsed, total);
}

export default function GoalsScreen() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [todaySpend, setTodaySpend] = useState(0);
  const [monthSpend, setMonthSpend] = useState(0);

  // Form fields
  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetMonth, setTargetMonth] = useState('');
  const [targetYear, setTargetYear] = useState('');
  const [salary, setSalary] = useState('');
  const [emis, setEmis] = useState('');
  const [expenses, setExpenses] = useState('');
  const [maintenance, setMaintenance] = useState('');

  const loadData = useCallback(async () => {
    const [g, ts, ms] = await Promise.all([
      getGoals(),
      getTodaySpend(),
      getMonthSpend(),
    ]);
    setGoals(g);
    setTodaySpend(ts);
    setMonthSpend(ms);
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  const resetForm = () => {
    setGoalName('');
    setTargetAmount('');
    setTargetMonth('');
    setTargetYear('');
    setSalary('');
    setEmis('');
    setExpenses('');
    setMaintenance('');
    setShowForm(false);
  };

  const handleCreateGoal = async () => {
    const name = goalName.trim();
    const target = parseFloat(targetAmount);
    const month = parseInt(targetMonth, 10);
    const year = parseInt(targetYear, 10);
    const salaryVal = parseFloat(salary) || 0;
    const emisVal = parseFloat(emis) || 0;
    const expensesVal = parseFloat(expenses) || 0;
    const maintenanceVal = parseFloat(maintenance) || 0;

    if (!name) {
      Alert.alert('Missing', 'Please enter a goal name.');
      return;
    }
    if (!target || target <= 0) {
      Alert.alert('Missing', 'Please enter a valid target amount.');
      return;
    }
    if (!month || month < 1 || month > 12 || !year || year < 2024) {
      Alert.alert('Missing', 'Please enter a valid target month (1-12) and year.');
      return;
    }
    if (!salaryVal || salaryVal <= 0) {
      Alert.alert('Missing', 'Please enter your monthly salary.');
      return;
    }

    const targetDate = new Date(year, month - 1, 1).getTime();
    const now = new Date();

    if (targetDate <= now.getTime()) {
      Alert.alert('Invalid Date', 'Target date must be in the future.');
      return;
    }

    const monthsRemaining = monthsBetween(now, new Date(targetDate));
    const monthlySavings = salaryVal - emisVal - expensesVal - maintenanceVal;
    const monthlyBudgetForGoal = target / monthsRemaining;
    const dailyBudget = (monthlySavings - monthlyBudgetForGoal) / 30;

    if (dailyBudget < 0) {
      Alert.alert(
        'Warning',
        'Target may not be achievable with current expenses. Your daily budget would be negative. Do you still want to save this goal?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save Anyway',
            onPress: async () => {
              await doSaveGoal(name, target, targetDate, salaryVal, emisVal, expensesVal, maintenanceVal, dailyBudget, monthlyBudgetForGoal);
            },
          },
        ],
      );
      return;
    }

    await doSaveGoal(name, target, targetDate, salaryVal, emisVal, expensesVal, maintenanceVal, dailyBudget, monthlyBudgetForGoal);
  };

  const doSaveGoal = async (
    name: string, target: number, targetDate: number,
    salaryVal: number, emisVal: number, expensesVal: number,
    maintenanceVal: number, dailyBudget: number, monthlyBudget: number,
  ) => {
    const goal: SavingsGoal = {
      id: generateId(),
      name,
      targetAmount: target,
      targetDate,
      salary: salaryVal,
      emis: emisVal,
      expenses: expensesVal,
      maintenance: maintenanceVal,
      dailyBudget: Math.max(dailyBudget, 0),
      monthlyBudget,
      streak: 0,
      lastStreakDate: '',
      createdAt: Date.now(),
    };
    await saveGoal(goal);
    resetForm();
    await loadData();
  };

  const handleDeleteGoal = (goal: SavingsGoal) => {
    Alert.alert(
      'Delete Goal',
      `Are you sure you want to delete "${goal.name}"? Your streak will be lost.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteGoal(goal.id);
            await loadData();
          },
        },
      ],
    );
  };

  const updateStreak = useCallback(async (goal: SavingsGoal) => {
    const today = getToday();
    if (goal.lastStreakDate === today) return goal;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let newStreak = goal.streak;

    if (todaySpend <= goal.dailyBudget) {
      // Within budget today
      if (goal.lastStreakDate === yesterdayStr || goal.lastStreakDate === '') {
        newStreak = goal.streak + 1;
      } else {
        newStreak = 1;
      }
    } else {
      // Exceeded budget
      newStreak = 0;
    }

    const updated: SavingsGoal = {
      ...goal,
      streak: newStreak,
      lastStreakDate: today,
    };
    await saveGoal(updated);
    return updated;
  }, [todaySpend]);

  // Update streaks on focus
  useFocusEffect(useCallback(() => {
    (async () => {
      for (const goal of goals) {
        await updateStreak(goal);
      }
      const refreshed = await getGoals();
      setGoals(refreshed);
    })();
  }, [goals.length, todaySpend]));

  const getDailyBudgetToday = (goal: SavingsGoal): number => {
    // Accumulated: if spent less yesterday, today's budget increases
    // For simplicity, use base daily budget adjusted by today's remaining
    return Math.max(goal.dailyBudget - todaySpend, 0);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <LinearGradient
        colors={['#1C1708', '#0E0C04', COLORS.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.emptyCard}
      >
        <View style={styles.emptyGoldLine} />
        <View style={styles.emptyIconWrap}>
          <Text style={styles.emptyIcon}>🎯</Text>
        </View>
        <Text style={styles.emptyTitle}>Set a Goal</Text>
        <Text style={styles.emptySubtitle}>
          Define a savings goal and track your daily spending against it.
          Stay disciplined, build streaks, and reach your target.
        </Text>
        <TouchableOpacity
          style={styles.createBtnPrimary}
          onPress={() => setShowForm(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.createBtnPrimaryText}>Create Your First Goal</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );

  const renderForm = () => (
    <View style={styles.formCard}>
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>New Savings Goal</Text>
        <TouchableOpacity onPress={resetForm}>
          <Text style={styles.formCancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formDivider} />

      <Text style={styles.fieldLabel}>GOAL NAME</Text>
      <TextInput
        style={styles.input}
        value={goalName}
        onChangeText={setGoalName}
        placeholder="e.g. Trip to Spain, Buy a Bike"
        placeholderTextColor={COLORS.textLight}
        selectionColor={COLORS.primary}
        maxLength={50}
      />

      <Text style={styles.fieldLabel}>TARGET AMOUNT (₹)</Text>
      <TextInput
        style={styles.input}
        value={targetAmount}
        onChangeText={setTargetAmount}
        placeholder="e.g. 150000"
        placeholderTextColor={COLORS.textLight}
        keyboardType="numeric"
        selectionColor={COLORS.primary}
      />

      <View style={styles.rowFields}>
        <View style={styles.halfField}>
          <Text style={styles.fieldLabel}>TARGET MONTH (1-12)</Text>
          <TextInput
            style={styles.input}
            value={targetMonth}
            onChangeText={setTargetMonth}
            placeholder="e.g. 6"
            placeholderTextColor={COLORS.textLight}
            keyboardType="numeric"
            selectionColor={COLORS.primary}
            maxLength={2}
          />
        </View>
        <View style={styles.halfField}>
          <Text style={styles.fieldLabel}>TARGET YEAR</Text>
          <TextInput
            style={styles.input}
            value={targetYear}
            onChangeText={setTargetYear}
            placeholder="e.g. 2026"
            placeholderTextColor={COLORS.textLight}
            keyboardType="numeric"
            selectionColor={COLORS.primary}
            maxLength={4}
          />
        </View>
      </View>

      <View style={styles.formDivider} />
      <Text style={styles.formSectionLabel}>MONTHLY FINANCES</Text>

      <Text style={styles.fieldLabel}>MONTHLY SALARY (₹)</Text>
      <TextInput
        style={styles.input}
        value={salary}
        onChangeText={setSalary}
        placeholder="e.g. 80000"
        placeholderTextColor={COLORS.textLight}
        keyboardType="numeric"
        selectionColor={COLORS.primary}
      />

      <Text style={styles.fieldLabel}>EMIs (₹)</Text>
      <TextInput
        style={styles.input}
        value={emis}
        onChangeText={setEmis}
        placeholder="e.g. 15000"
        placeholderTextColor={COLORS.textLight}
        keyboardType="numeric"
        selectionColor={COLORS.primary}
      />

      <Text style={styles.fieldLabel}>RENT + BILLS (₹)</Text>
      <TextInput
        style={styles.input}
        value={expenses}
        onChangeText={setExpenses}
        placeholder="e.g. 20000"
        placeholderTextColor={COLORS.textLight}
        keyboardType="numeric"
        selectionColor={COLORS.primary}
      />

      <Text style={styles.fieldLabel}>MAINTENANCE - BIKE/CAR (₹)</Text>
      <TextInput
        style={styles.input}
        value={maintenance}
        onChangeText={setMaintenance}
        placeholder="e.g. 3000"
        placeholderTextColor={COLORS.textLight}
        keyboardType="numeric"
        selectionColor={COLORS.primary}
      />

      <TouchableOpacity
        style={styles.submitBtn}
        onPress={handleCreateGoal}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.submitBtnGradient}
        >
          <Text style={styles.submitBtnText}>Calculate & Save Goal</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderGoalCard = (goal: SavingsGoal) => {
    const totalMonths = monthsBetween(new Date(goal.createdAt), new Date(goal.targetDate));
    const elapsed = monthsElapsed(goal.createdAt, goal.targetDate);
    const progress = Math.min(elapsed / totalMonths, 1);
    const dailyRemaining = getDailyBudgetToday(goal);
    const monthlyBudget = goal.monthlyBudget;

    return (
      <View key={goal.id} style={styles.goalCard}>
        {/* Goal Header */}
        <LinearGradient
          colors={['#1C1708', '#0E0C04', COLORS.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.goalHeader}
        >
          <View style={styles.goalHeaderGoldLine} />
          <View style={styles.goalHeaderContent}>
            <View style={styles.goalHeaderLeft}>
              <Text style={styles.goalName}>{goal.name}</Text>
              <Text style={styles.goalTarget}>{formatCurrency(goal.targetAmount)}</Text>
            </View>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDeleteGoal(goal)}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteBtnText}>🗑️</Text>
            </TouchableOpacity>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>
                {elapsed} of {totalMonths} months
              </Text>
              <Text style={styles.progressPercent}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.max(progress * 100, 2)}%` },
                ]}
              />
            </View>
          </View>
        </LinearGradient>

        {/* Daily Budget Card */}
        <View style={styles.dailyBudgetCard}>
          <Text style={styles.dailyBudgetLabel}>YOU CAN SPEND TODAY</Text>
          <Text
            style={[
              styles.dailyBudgetAmount,
              dailyRemaining <= 0 && styles.dailyBudgetNegative,
            ]}
          >
            {formatCurrency(dailyRemaining)}
          </Text>
          {todaySpend > 0 && (
            <Text style={styles.dailyBudgetSub}>
              Spent today: {formatCurrency(todaySpend)} of {formatCurrency(goal.dailyBudget)} budget
            </Text>
          )}
          {dailyRemaining <= 0 && (
            <View style={styles.warningBadge}>
              <Text style={styles.warningBadgeText}>Budget exceeded for today</Text>
            </View>
          )}
        </View>

        {/* Streak */}
        <View style={styles.streakCard}>
          <View style={styles.streakRow}>
            <Text style={styles.streakFire}>🔥</Text>
            <Text style={styles.streakCount}>{goal.streak}</Text>
            <Text style={styles.streakLabel}>day streak</Text>
          </View>
          <Text style={styles.streakHint}>
            {goal.streak === 0
              ? 'Stay within your daily budget to start a streak'
              : 'Keep it going! Stay within budget to continue'}
          </Text>
        </View>

        {/* Monthly Breakdown */}
        <View style={styles.monthlyCard}>
          <Text style={styles.monthlyTitle}>THIS MONTH</Text>
          <View style={styles.monthlyRow}>
            <View style={styles.monthlyItem}>
              <Text style={styles.monthlyItemLabel}>Spent</Text>
              <Text style={styles.monthlyItemValue}>{formatCurrency(monthSpend)}</Text>
            </View>
            <View style={styles.monthlyDivider} />
            <View style={styles.monthlyItem}>
              <Text style={styles.monthlyItemLabel}>Budget</Text>
              <Text style={styles.monthlyItemValueGold}>{formatCurrency(monthlyBudget)}</Text>
            </View>
            <View style={styles.monthlyDivider} />
            <View style={styles.monthlyItem}>
              <Text style={styles.monthlyItemLabel}>Status</Text>
              <Text
                style={[
                  styles.monthlyItemValue,
                  { color: monthSpend <= monthlyBudget ? COLORS.success : COLORS.danger },
                ]}
              >
                {monthSpend <= monthlyBudget ? 'On Track' : 'Over'}
              </Text>
            </View>
          </View>
        </View>

        {/* Goal Details */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Daily budget</Text>
            <Text style={styles.detailValue}>{formatCurrency(goal.dailyBudget)}</Text>
          </View>
          <View style={styles.detailDividerThin} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Monthly set-aside</Text>
            <Text style={styles.detailValue}>{formatCurrency(goal.monthlyBudget)}</Text>
          </View>
          <View style={styles.detailDividerThin} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Monthly savings</Text>
            <Text style={styles.detailValue}>
              {formatCurrency(goal.salary - goal.emis - goal.expenses - goal.maintenance)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen Title */}
        <View style={styles.titleRow}>
          <Text style={styles.screenTitle}>Savings Goals</Text>
          {goals.length > 0 && !showForm && (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setShowForm(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.addBtnText}>+ New</Text>
            </TouchableOpacity>
          )}
        </View>

        {showForm && renderForm()}

        {goals.length === 0 && !showForm && renderEmptyState()}

        {goals.map(renderGoalCard)}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },

  /* ── Screen Title ─────────────────────────────────────────────── */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 4,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  addBtn: {
    backgroundColor: `${COLORS.primary}20`,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${COLORS.primary}40`,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.3,
  },

  /* ── Empty State ──────────────────────────────────────────────── */
  emptyContainer: {
    marginTop: 20,
  },
  emptyCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    position: 'relative',
    overflow: 'hidden',
  },
  emptyGoldLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${COLORS.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  createBtnPrimary: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  createBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.background,
    letterSpacing: 0.3,
  },

  /* ── Form ─────────────────────────────────────────────────────── */
  formCard: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  formCancel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  formDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 16,
  },
  formSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  rowFields: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  submitBtn: {
    marginTop: 4,
    borderRadius: 14,
    overflow: 'hidden',
  },
  submitBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 14,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.background,
    letterSpacing: 0.3,
  },

  /* ── Goal Card ────────────────────────────────────────────────── */
  goalCard: {
    marginBottom: 24,
  },
  goalHeader: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    borderBottomWidth: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  goalHeaderGoldLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  goalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  goalHeaderLeft: {
    flex: 1,
  },
  goalName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  goalTarget: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: `${COLORS.danger}15`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.danger}25`,
  },
  deleteBtnText: {
    fontSize: 16,
  },

  /* ── Progress ─────────────────────────────────────────────────── */
  progressSection: {
    marginTop: 4,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.3,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: COLORS.surfaceHigher,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },

  /* ── Daily Budget ─────────────────────────────────────────────── */
  dailyBudgetCard: {
    backgroundColor: COLORS.surfaceHigh,
    padding: 20,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  dailyBudgetLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginBottom: 8,
  },
  dailyBudgetAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: -1,
  },
  dailyBudgetNegative: {
    color: COLORS.danger,
  },
  dailyBudgetSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  warningBadge: {
    backgroundColor: `${COLORS.danger}15`,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: `${COLORS.danger}25`,
  },
  warningBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.danger,
    letterSpacing: 0.3,
  },

  /* ── Streak ───────────────────────────────────────────────────── */
  streakCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  streakFire: {
    fontSize: 22,
  },
  streakCount: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.warning,
    letterSpacing: -0.5,
  },
  streakLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  streakHint: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },

  /* ── Monthly Breakdown ────────────────────────────────────────── */
  monthlyCard: {
    backgroundColor: COLORS.surfaceHigh,
    padding: 16,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
  },
  monthlyTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  monthlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthlyItem: {
    flex: 1,
    alignItems: 'center',
  },
  monthlyItemLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  monthlyItemValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  monthlyItemValueGold: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  monthlyDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
  },

  /* ── Goal Details ─────────────────────────────────────────────── */
  detailsCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: COLORS.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  detailDividerThin: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: 2,
  },
});
