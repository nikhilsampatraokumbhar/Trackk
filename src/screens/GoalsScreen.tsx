import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Dimensions, Modal, Animated, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { SavingsGoal, DailySpend } from '../models/types';
import {
  getGoals, saveGoal, deleteGoal,
  computeTodaySpendFromTransactions, computeMonthSpendFromTransactions,
  getOrCreateTodaySpend, getYesterdayLeftover,
  saveLeftoverToJar, carryForwardLeftover, emptyJar,
  getSharedFinances, saveSharedFinances, SharedFinances,
} from '../services/StorageService';
import { FinanceItem } from '../models/types';
import { usePremium } from '../store/PremiumContext';
import { useTracker } from '../store/TrackerContext';
import { COLORS, formatCurrency, generateId } from '../utils/helpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* ── Helpers ─────────────────────────────────────────────────────────── */

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

function formatTargetDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function daysRemaining(targetDate: number): number {
  const now = new Date();
  const target = new Date(targetDate);
  const diff = target.getTime() - now.getTime();
  return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
}

function getStreakTier(streak: number): { label: string; color: string; emoji: string } {
  if (streak >= 30) return { label: 'LEGENDARY', color: '#FFD700', emoji: '\uD83D\uDD25' };
  if (streak >= 14) return { label: 'ON FIRE', color: '#FF6B35', emoji: '\uD83D\uDD25' };
  if (streak >= 7) return { label: 'HOT STREAK', color: COLORS.warning, emoji: '\uD83D\uDD25' };
  if (streak >= 3) return { label: 'BUILDING', color: COLORS.success, emoji: '\u26A1' };
  if (streak >= 1) return { label: 'STARTED', color: COLORS.textSecondary, emoji: '\u2B50' };
  return { label: 'NO STREAK', color: COLORS.textSecondary, emoji: '\uD83C\uDFAF' };
}

/* ── Component ───────────────────────────────────────────────────────── */

type Nav = NativeStackNavigationProp<RootStackParamList>;

const FREE_GOAL_LIMIT = 2;

export default function GoalsScreen() {
  const nav = useNavigation<Nav>();
  const { isPremium } = usePremium();
  const { trackerState, togglePersonal, toggleGroupAffectsGoal } = useTracker();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [todaySpend, setTodaySpend] = useState(0);
  const [monthSpend, setMonthSpend] = useState(0);
  const [todayDailySpend, setTodayDailySpend] = useState<DailySpend | null>(null);
  const [yesterdayLeftover, setYesterdayLeftover] = useState<{ amount: number; action: string } | null>(null);
  const [showLeftoverSheet, setShowLeftoverSheet] = useState(false);

  // Form fields
  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetMonths, setTargetMonths] = useState('');
  const [salary, setSalary] = useState('');
  const [emis, setEmis] = useState('');
  const [expenses, setExpenses] = useState('');
  const [maintenance, setMaintenance] = useState('');
  const [customFinances, setCustomFinances] = useState<FinanceItem[]>([]);

  // Refs for input focus chaining
  const targetAmountRef = useRef<TextInput>(null);
  const targetMonthsRef = useRef<TextInput>(null);
  const salaryRef = useRef<TextInput>(null);
  const emisRef = useRef<TextInput>(null);
  const expensesRef = useRef<TextInput>(null);
  const maintenanceRef = useRef<TextInput>(null);

  /* ── Data Loading ─────────────────────────────────────────────────── */

  const loadData = useCallback(async () => {
    const excludeGroup = !trackerState.groupAffectsGoal;
    const [g, ts, ms] = await Promise.all([
      getGoals(),
      computeTodaySpendFromTransactions(excludeGroup),
      computeMonthSpendFromTransactions(excludeGroup),
    ]);
    setGoals(g);
    setTodaySpend(ts);
    setMonthSpend(ms);

    // Load daily spend entry with carryover info
    // For multi-goal: use combined daily budget (shared finances - sum of all set-asides)
    if (g.length > 0) {
      const ref = g[0]; // all goals share same salary/expenses
      const customTotal = (ref.customFinances || []).reduce((s, f) => s + f.amount, 0);
      const monthlySavings = ref.salary - ref.emis - ref.expenses - ref.maintenance - customTotal;
      const totalSetAside = g.reduce((s, goal) => s + goal.monthlyBudget, 0);
      const combinedDailyBudget = Math.max((monthlySavings - totalSetAside) / 30, 0);
      const dailyEntry = await getOrCreateTodaySpend(combinedDailyBudget, excludeGroup);
      setTodayDailySpend(dailyEntry);

      // Check for yesterday's pending leftover
      const leftover = await getYesterdayLeftover();
      if (leftover && leftover.action === 'pending' && leftover.amount > 0) {
        setYesterdayLeftover(leftover);
        setShowLeftoverSheet(true);
      } else {
        setYesterdayLeftover(null);
        setShowLeftoverSheet(false);
      }
    }
  }, [trackerState.groupAffectsGoal]);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  /* ── Form Logic ───────────────────────────────────────────────────── */

  const resetForm = () => {
    setGoalName('');
    setTargetAmount('');
    setTargetMonths('');
    setSalary('');
    setEmis('');
    setExpenses('');
    setMaintenance('');
    setCustomFinances([]);
    setEditingGoal(null);
    setShowForm(false);
  };

  /** Load shared finances to prefill form when creating a new goal */
  const prefillFinances = useCallback(async () => {
    const shared = await getSharedFinances();
    if (shared) {
      setSalary(shared.salary > 0 ? String(shared.salary) : '');
      setEmis(shared.emis > 0 ? String(shared.emis) : '');
      setExpenses(shared.expenses > 0 ? String(shared.expenses) : '');
      setMaintenance(shared.maintenance > 0 ? String(shared.maintenance) : '');
      setCustomFinances(shared.customFinances || []);
    }
  }, []);

  const computeBudgets = () => {
    const salaryVal = parseFloat(salary) || 0;
    const emisVal = parseFloat(emis) || 0;
    const expensesVal = parseFloat(expenses) || 0;
    const maintenanceVal = parseFloat(maintenance) || 0;
    const customTotal = customFinances.reduce((s, f) => s + f.amount, 0);
    const totalFixed = emisVal + expensesVal + maintenanceVal + customTotal;
    const monthlyBudget = salaryVal - totalFixed;
    const dailyBudget = monthlyBudget / 30;
    return { salaryVal, emisVal, expensesVal, maintenanceVal, customTotal, totalFixed, monthlyBudget, dailyBudget };
  };

  const handleCreateGoal = async () => {
    const name = goalName.trim();
    const target = parseFloat(targetAmount);
    const months = parseInt(targetMonths, 10);
    const { salaryVal, emisVal, expensesVal, maintenanceVal, customTotal } = computeBudgets();

    if (!name) {
      Alert.alert('Missing', 'Please enter a goal name.');
      return;
    }
    if (!target || target <= 0) {
      Alert.alert('Missing', 'Please enter a valid target amount.');
      return;
    }
    if (!months || months < 1 || months > 36) {
      Alert.alert('Missing', 'Please enter target months (1-36).');
      return;
    }
    if (!salaryVal || salaryVal <= 0) {
      Alert.alert('Missing', 'Please enter your monthly salary.');
      return;
    }

    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth() + months, 1).getTime();

    // Save shared finances for future goals
    await saveSharedFinances({
      salary: salaryVal,
      emis: emisVal,
      expenses: expensesVal,
      maintenance: maintenanceVal,
      customFinances,
    });

    // For multi-goal: total monthly set-aside = sum of existing goals' monthlyBudget + this goal
    const existingGoals = await getGoals();
    // When editing, exclude this goal's current set-aside from the total
    const existingMonthlySetAside = existingGoals
      .filter(g => !editingGoal || g.id !== editingGoal.id)
      .reduce((s, g) => s + g.monthlyBudget, 0);
    const monthlySavings = salaryVal - emisVal - expensesVal - maintenanceVal - customTotal;
    const monthlyBudgetForGoal = target / months;
    const totalSetAside = existingMonthlySetAside + monthlyBudgetForGoal;
    const dailyBudget = (monthlySavings - totalSetAside) / 30;

    if (dailyBudget < 0) {
      Alert.alert(
        'Warning',
        'Target may not be achievable with current expenses. Your daily budget would be negative. Do you still want to save this goal?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save Anyway',
            onPress: async () => {
              await doSaveGoal(name, target, targetDate, months, salaryVal, emisVal, expensesVal, maintenanceVal, dailyBudget, monthlyBudgetForGoal);
            },
          },
        ],
      );
      return;
    }

    await doSaveGoal(name, target, targetDate, months, salaryVal, emisVal, expensesVal, maintenanceVal, dailyBudget, monthlyBudgetForGoal);
  };

  const doSaveGoal = async (
    name: string, target: number, targetDate: number, tMonths: number,
    salaryVal: number, emisVal: number, expensesVal: number,
    maintenanceVal: number, dailyBudget: number, monthlyBudget: number,
  ) => {
    const goal: SavingsGoal = editingGoal
      ? {
          ...editingGoal,
          name,
          targetAmount: target,
          targetDate,
          targetMonths: tMonths,
          salary: salaryVal,
          emis: emisVal,
          expenses: expensesVal,
          maintenance: maintenanceVal,
          customFinances,
          dailyBudget: Math.max(dailyBudget, 0),
          monthlyBudget,
        }
      : {
          id: generateId(),
          name,
          targetAmount: target,
          targetDate,
          targetMonths: tMonths,
          salary: salaryVal,
          emis: emisVal,
          expenses: expensesVal,
          maintenance: maintenanceVal,
          customFinances,
          dailyBudget: Math.max(dailyBudget, 0),
          monthlyBudget,
          streak: 0,
          lastStreakDate: '',
          savingsJar: 0,
          totalSaved: 0,
          createdAt: Date.now(),
        };
    await saveGoal(goal);

    // Auto-enable personal tracking if not already on
    if (!trackerState.personal) {
      await togglePersonal();
    }

    resetForm();
    await loadData();
  };

  /* ── Delete Goal ──────────────────────────────────────────────────── */

  const handleDeleteGoal = (goal: SavingsGoal) => {
    Alert.alert(
      'Delete Goal',
      `Are you sure you want to delete "${goal.name}"? This will permanently remove the goal and reset your ${goal.streak}-day streak.`,
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

  /* ── Edit Goal ──────────────────────────────────────────────────── */

  const handleEditGoal = (goal: SavingsGoal) => {
    setEditingGoal(goal);
    setGoalName(goal.name);
    setTargetAmount(String(goal.targetAmount));
    setTargetMonths(String(goal.targetMonths));
    setSalary(goal.salary > 0 ? String(goal.salary) : '');
    setEmis(goal.emis > 0 ? String(goal.emis) : '');
    setExpenses(goal.expenses > 0 ? String(goal.expenses) : '');
    setMaintenance(goal.maintenance > 0 ? String(goal.maintenance) : '');
    setCustomFinances(goal.customFinances || []);
    setShowForm(true);
  };

  /* ── Streak Logic ─────────────────────────────────────────────────── */

  const updateStreak = useCallback(async (goal: SavingsGoal) => {
    const today = getToday();
    if (goal.lastStreakDate === today) return goal;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Use effective budget (includes carryover) for streak check
    const effectiveBudget = todayDailySpend?.effectiveBudget || goal.dailyBudget;
    let newStreak = goal.streak;

    if (todaySpend <= effectiveBudget) {
      if (goal.lastStreakDate === yesterdayStr || goal.lastStreakDate === '') {
        newStreak = goal.streak + 1;
      } else {
        newStreak = 1;
      }
    } else {
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

  useFocusEffect(useCallback(() => {
    (async () => {
      for (const goal of goals) {
        await updateStreak(goal);
      }
      const refreshed = await getGoals();
      setGoals(refreshed);
    })();
  }, [goals.length, todaySpend]));

  /* ── Computed Values ──────────────────────────────────────────────── */

  const getEffectiveDailyBudget = (goal: SavingsGoal): number => {
    return todayDailySpend?.effectiveBudget || goal.dailyBudget;
  };

  const getDailyBudgetRemaining = (goal: SavingsGoal): number => {
    return getEffectiveDailyBudget(goal) - todaySpend;
  };

  const getProgressFraction = (goal: SavingsGoal): number => {
    const totalMonths = monthsBetween(new Date(goal.createdAt), new Date(goal.targetDate));
    const elapsed = monthsElapsed(goal.createdAt, goal.targetDate);
    return Math.min(elapsed / totalMonths, 1);
  };

  const getEstimatedSavings = (goal: SavingsGoal): number => {
    const elapsed = monthsElapsed(goal.createdAt, goal.targetDate);
    return goal.monthlyBudget * elapsed;
  };

  /* ── Live Preview (computed from form state) ──────────────────────── */

  const getLivePreview = () => {
    const { salaryVal, monthlyBudget, dailyBudget } = computeBudgets();
    const target = parseFloat(targetAmount) || 0;
    const months = parseInt(targetMonths, 10);

    let monthlySetAside = 0;
    let adjustedDaily = dailyBudget;

    if (target > 0 && months >= 1 && months <= 36) {
      // For multi-goal: account for existing goals' set-aside
      const existingSetAside = goals.reduce((s, g) => s + g.monthlyBudget, 0);
      monthlySetAside = target / months;
      adjustedDaily = (monthlyBudget - existingSetAside - monthlySetAside) / 30;
    }

    return {
      monthlyBudget,
      dailyBudget: adjustedDaily,
      monthlySetAside,
      existingSetAside: goals.reduce((s, g) => s + g.monthlyBudget, 0),
      hasSalary: salaryVal > 0,
    };
  };

  const preview = getLivePreview();

  /* ── Leftover Actions ───────────────────────────────────────────── */

  const handleSaveToJar = async (goalId: string) => {
    const amount = await saveLeftoverToJar(goalId);
    if (amount > 0) {
      setShowLeftoverSheet(false);
      setYesterdayLeftover(null);
      await loadData();
      Alert.alert('Saved!', `${formatCurrency(amount)} added to your Savings Jar`);
    }
  };

  const handleCarryForward = async () => {
    await carryForwardLeftover();
    setShowLeftoverSheet(false);
    setYesterdayLeftover(null);
    await loadData();
  };

  const handleEmptyJar = async (goal: SavingsGoal) => {
    if (!goal.savingsJar || goal.savingsJar <= 0) return;
    Alert.alert(
      'Mark as Saved',
      `Mark ${formatCurrency(goal.savingsJar)} as invested/saved? This resets the jar.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, I saved it!',
          onPress: async () => {
            const amount = await emptyJar(goal.id);
            await loadData();
            Alert.alert('Awesome!', `${formatCurrency(amount)} marked as saved. Total lifetime savings: ${formatCurrency((goal.totalSaved || 0) + amount)}`);
          },
        },
      ],
    );
  };

  /* ── Render: Empty State ──────────────────────────────────────────── */

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
          <Text style={styles.emptyIcon}>{'\uD83C\uDFAF'}</Text>
        </View>
        <Text style={styles.emptyTitle}>Set a Savings Goal</Text>
        <Text style={styles.emptySubtitle}>
          Define a savings target, track your daily spending against it,
          and build streaks to stay disciplined. Every day counts.
        </Text>
        <Text style={styles.emptyAutoSync}>
          Your personal expenses auto-sync with goals — zero manual work.
        </Text>
        <TouchableOpacity
          style={styles.createBtnPrimary}
          onPress={() => { prefillFinances(); setShowForm(true); }}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.createBtnGradient}
          >
            <Text style={styles.createBtnPrimaryText}>Create Your First Goal</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );

  /* ── Render: Form Modal ───────────────────────────────────────────── */

  const renderFormModal = () => (
    <Modal
      visible={showForm}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={resetForm}
    >
      <SafeAreaView style={styles.modalContainer} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={resetForm} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editingGoal ? 'Edit Goal' : 'New Goal'}</Text>
              <View style={styles.modalCancelBtn}>
                <Text style={[styles.modalCancelText, { opacity: 0 }]}>Cancel</Text>
              </View>
            </View>

            <View style={styles.modalDragIndicator} />

            {/* Goal Info Section */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionLabel}>GOAL DETAILS</Text>

              <Text style={styles.fieldLabel}>GOAL NAME</Text>
              <TextInput
                style={styles.input}
                value={goalName}
                onChangeText={setGoalName}
                placeholder="e.g. Trip to Spain, Buy a Bike"
                placeholderTextColor={COLORS.textLight}
                selectionColor={COLORS.primary}
                maxLength={50}
                returnKeyType="next"
                onSubmitEditing={() => targetAmountRef.current?.focus()}
              />

              <Text style={styles.fieldLabel}>TARGET AMOUNT</Text>
              <TextInput
                ref={targetAmountRef}
                style={styles.input}
                value={targetAmount}
                onChangeText={setTargetAmount}
                placeholder="150000"
                placeholderTextColor={COLORS.textLight}
                keyboardType="numeric"
                selectionColor={COLORS.primary}
                returnKeyType="next"
                onSubmitEditing={() => targetMonthsRef.current?.focus()}
              />

              <Text style={styles.fieldLabel}>TARGET MONTHS (1-36)</Text>
              <TextInput
                ref={targetMonthsRef}
                style={styles.input}
                value={targetMonths}
                onChangeText={setTargetMonths}
                placeholder="12"
                placeholderTextColor={COLORS.textLight}
                keyboardType="numeric"
                selectionColor={COLORS.primary}
                maxLength={2}
                returnKeyType="next"
                onSubmitEditing={() => salaryRef.current?.focus()}
              />
            </View>

            {/* Finances Section */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionLabel}>MONTHLY FINANCES</Text>

              <Text style={styles.fieldLabel}>MONTHLY SALARY</Text>
              <TextInput
                ref={salaryRef}
                style={styles.input}
                value={salary}
                onChangeText={setSalary}
                placeholder="80000"
                placeholderTextColor={COLORS.textLight}
                keyboardType="numeric"
                selectionColor={COLORS.primary}
                returnKeyType="next"
                onSubmitEditing={() => emisRef.current?.focus()}
              />

              <Text style={styles.fieldLabel}>EMIs</Text>
              <TextInput
                ref={emisRef}
                style={styles.input}
                value={emis}
                onChangeText={setEmis}
                placeholder="0"
                placeholderTextColor={COLORS.textLight}
                keyboardType="numeric"
                selectionColor={COLORS.primary}
                returnKeyType="next"
                onSubmitEditing={() => expensesRef.current?.focus()}
              />

              <Text style={styles.fieldLabel}>RENT + BILLS</Text>
              <TextInput
                ref={expensesRef}
                style={styles.input}
                value={expenses}
                onChangeText={setExpenses}
                placeholder="0"
                placeholderTextColor={COLORS.textLight}
                keyboardType="numeric"
                selectionColor={COLORS.primary}
                returnKeyType="next"
                onSubmitEditing={() => maintenanceRef.current?.focus()}
              />

              <Text style={styles.fieldLabel}>MAINTENANCE (BIKE/CAR)</Text>
              <TextInput
                ref={maintenanceRef}
                style={styles.input}
                value={maintenance}
                onChangeText={setMaintenance}
                placeholder="0"
                placeholderTextColor={COLORS.textLight}
                keyboardType="numeric"
                selectionColor={COLORS.primary}
                returnKeyType="done"
              />

              {/* Custom finance fields */}
              {customFinances.map((item, idx) => (
                <View key={idx} style={styles.customFinanceRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0, marginRight: 8 }]}
                    value={item.label}
                    onChangeText={(text) => {
                      const updated = [...customFinances];
                      updated[idx] = { ...updated[idx], label: text };
                      setCustomFinances(updated);
                    }}
                    placeholder="Label"
                    placeholderTextColor={COLORS.textLight}
                    selectionColor={COLORS.primary}
                  />
                  <TextInput
                    style={[styles.input, { width: 100, marginBottom: 0, marginRight: 8 }]}
                    value={item.amount > 0 ? String(item.amount) : ''}
                    onChangeText={(text) => {
                      const updated = [...customFinances];
                      updated[idx] = { ...updated[idx], amount: parseFloat(text) || 0 };
                      setCustomFinances(updated);
                    }}
                    placeholder="0"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="numeric"
                    selectionColor={COLORS.primary}
                  />
                  <TouchableOpacity
                    onPress={() => setCustomFinances(customFinances.filter((_, i) => i !== idx))}
                    style={styles.removeCustomBtn}
                  >
                    <Text style={styles.removeCustomBtnText}>{'\u2715'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={styles.addCustomBtn}
                onPress={() => setCustomFinances([...customFinances, { label: '', amount: 0 }])}
                activeOpacity={0.7}
              >
                <Text style={styles.addCustomBtnText}>+ Add Expense</Text>
              </TouchableOpacity>
            </View>

            {/* Live Budget Preview */}
            {preview.hasSalary && (
              <View style={styles.previewCard}>
                <LinearGradient
                  colors={['#1C1708', '#0E0C04']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.previewGradient}
                >
                  <Text style={styles.previewTitle}>BUDGET PREVIEW</Text>
                  <View style={styles.previewRow}>
                    <View style={styles.previewItem}>
                      <Text style={styles.previewLabel}>Monthly Budget</Text>
                      <Text style={[
                        styles.previewValue,
                        preview.monthlyBudget < 0 && { color: COLORS.danger },
                      ]}>
                        {formatCurrency(preview.monthlyBudget)}
                      </Text>
                    </View>
                    <View style={styles.previewDivider} />
                    <View style={styles.previewItem}>
                      <Text style={styles.previewLabel}>Daily Budget</Text>
                      <Text style={[
                        styles.previewValue,
                        preview.dailyBudget < 0 && { color: COLORS.danger },
                      ]}>
                        {formatCurrency(Math.max(preview.dailyBudget, 0))}
                      </Text>
                    </View>
                  </View>
                  {preview.monthlySetAside > 0 && (
                    <View style={styles.previewSetAside}>
                      <Text style={styles.previewSetAsideLabel}>Monthly set-aside for this goal</Text>
                      <Text style={styles.previewSetAsideValue}>
                        {formatCurrency(preview.monthlySetAside)}
                      </Text>
                    </View>
                  )}
                  {preview.existingSetAside > 0 && (
                    <View style={styles.previewSetAside}>
                      <Text style={styles.previewSetAsideLabel}>Existing goals set-aside</Text>
                      <Text style={[styles.previewSetAsideValue, { color: COLORS.textSecondary }]}>
                        {formatCurrency(preview.existingSetAside)}
                      </Text>
                    </View>
                  )}
                </LinearGradient>
              </View>
            )}

            {/* Submit Button */}
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
                <Text style={styles.submitBtnText}>{editingGoal ? 'Update Goal' : 'Calculate & Save Goal'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );

  /* ── Render: Streak Badge ─────────────────────────────────────────── */

  const renderStreakBadge = (goal: SavingsGoal) => {
    const tier = getStreakTier(goal.streak);
    const dotCount = Math.min(goal.streak, 7);

    return (
      <View style={styles.streakCard}>
        <View style={styles.streakTopRow}>
          <View style={styles.streakCountWrap}>
            <Text style={styles.streakEmoji}>{tier.emoji}</Text>
            <Text style={[styles.streakCount, { color: tier.color }]}>{goal.streak}</Text>
          </View>
          <View style={styles.streakMeta}>
            <Text style={styles.streakDayLabel}>
              {goal.streak === 1 ? 'day' : 'days'}
            </Text>
            <View style={[styles.streakTierBadge, { backgroundColor: `${tier.color}20`, borderColor: `${tier.color}40` }]}>
              <Text style={[styles.streakTierText, { color: tier.color }]}>{tier.label}</Text>
            </View>
          </View>
        </View>

        {/* Streak dots - Snapchat-style */}
        <View style={styles.streakDotsRow}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.streakDot,
                i < dotCount
                  ? { backgroundColor: tier.color, borderColor: tier.color }
                  : { backgroundColor: COLORS.surfaceHigher, borderColor: COLORS.border },
              ]}
            />
          ))}
        </View>

        <Text style={styles.streakHint}>
          {goal.streak === 0
            ? 'Stay within your daily budget to start a streak'
            : goal.streak >= 7
              ? 'Incredible discipline! Keep the streak alive'
              : `${7 - goal.streak} more day${7 - goal.streak === 1 ? '' : 's'} to reach a hot streak`}
        </Text>
      </View>
    );
  };

  /* ── Render: Leftover Bottom Sheet ─────────────────────────────────── */

  const renderLeftoverSheet = () => {
    if (!showLeftoverSheet || !yesterdayLeftover || goals.length === 0) return null;
    const goal = goals[0];

    return (
      <Modal visible={showLeftoverSheet} animationType="slide" transparent onRequestClose={() => setShowLeftoverSheet(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Yesterday's Leftover</Text>
            <Text style={styles.sheetAmount}>{formatCurrency(yesterdayLeftover.amount)}</Text>
            <Text style={styles.sheetSubtitle}>You spent under budget yesterday! What would you like to do?</Text>

            <TouchableOpacity style={styles.sheetBtnPrimary} onPress={() => handleSaveToJar(goal.id)} activeOpacity={0.8}>
              <LinearGradient colors={[COLORS.success, '#2DA070']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sheetBtnGradient}>
                <Text style={styles.sheetBtnIcon}>{'\uD83C\uDFFA'}</Text>
                <View>
                  <Text style={styles.sheetBtnPrimaryText}>Add to Savings Jar</Text>
                  <Text style={styles.sheetBtnSub}>Save it for something meaningful</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetBtnSecondary} onPress={handleCarryForward} activeOpacity={0.8}>
              <Text style={styles.sheetBtnSecondaryIcon}>{'\u27A1\uFE0F'}</Text>
              <View>
                <Text style={styles.sheetBtnSecondaryText}>Carry to Today</Text>
                <Text style={styles.sheetBtnSubDim}>More spending money today</Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.sheetAutoNote}>Auto-carries to tomorrow if you don't choose</Text>
          </View>
        </View>
      </Modal>
    );
  };

  /* ── Render: Savings Jar ──────────────────────────────────────────── */

  const renderSavingsJar = (goal: SavingsGoal) => {
    const jarAmount = goal.savingsJar || 0;
    const totalSaved = goal.totalSaved || 0;
    if (jarAmount <= 0 && totalSaved <= 0) return null;

    return (
      <View style={styles.jarCard}>
        <View style={styles.jarHeader}>
          <Text style={styles.jarEmoji}>{'\uD83C\uDFFA'}</Text>
          <Text style={styles.jarTitle}>Savings Jar</Text>
        </View>

        {jarAmount > 0 && (
          <>
            <Text style={styles.jarAmount}>{formatCurrency(jarAmount)}</Text>
            <Text style={styles.jarSub}>Accumulated by spending under budget</Text>
            <TouchableOpacity style={styles.jarInvestBtn} onPress={() => handleEmptyJar(goal)} activeOpacity={0.8}>
              <Text style={styles.jarInvestBtnText}>I invested/saved this</Text>
            </TouchableOpacity>
          </>
        )}

        {jarAmount <= 0 && totalSaved > 0 && (
          <Text style={styles.jarEmptySub}>Jar is empty. Keep spending under budget to fill it!</Text>
        )}

        {totalSaved > 0 && (
          <View style={styles.jarLifetime}>
            <Text style={styles.jarLifetimeLabel}>Total Saved</Text>
            <Text style={styles.jarLifetimeValue}>{formatCurrency(totalSaved)}</Text>
          </View>
        )}
      </View>
    );
  };

  /* ── Render: Goal Card ────────────────────────────────────────────── */

  const renderGoalCard = (goal: SavingsGoal) => {
    const totalMonths = monthsBetween(new Date(goal.createdAt), new Date(goal.targetDate));
    const elapsed = monthsElapsed(goal.createdAt, goal.targetDate);
    const progress = getProgressFraction(goal);
    const effectiveBudget = getEffectiveDailyBudget(goal);
    const dailyRemaining = getDailyBudgetRemaining(goal);
    const estimatedSavings = getEstimatedSavings(goal);
    const savingsProgress = Math.min(estimatedSavings / goal.targetAmount, 1);
    const days = daysRemaining(goal.targetDate);
    const customTotal = (goal.customFinances || []).reduce((s, f) => s + f.amount, 0);
    const monthlySavings = goal.salary - goal.emis - goal.expenses - goal.maintenance - customTotal;
    const carryover = todayDailySpend?.carryover || 0;

    return (
      <View key={goal.id} style={styles.goalCard}>
        {/* ── Hero Header ── */}
        <LinearGradient
          colors={['#1C1708', '#12100A', COLORS.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.goalHeader}
        >
          <View style={styles.goalHeaderGoldLine} />

          <View style={styles.goalHeaderContent}>
            <View style={styles.goalHeaderLeft}>
              <Text style={styles.goalName} numberOfLines={1}>{goal.name}</Text>
              <Text style={styles.goalTarget}>{formatCurrency(goal.targetAmount)}</Text>
              <View style={styles.goalDateRow}>
                <Text style={styles.goalDateText}>
                  Target: {formatTargetDate(goal.targetDate)}
                </Text>
                <View style={styles.goalDaysChip}>
                  <Text style={styles.goalDaysText}>{days}d left</Text>
                </View>
              </View>
            </View>
            <View style={styles.goalActions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => handleEditGoal(goal)}
                activeOpacity={0.7}
              >
                <Text style={styles.editBtnIcon}>{'\u270E'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDeleteGoal(goal)}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteBtnIcon}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Savings Progress */}
          <View style={styles.savingsProgressSection}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>
                {formatCurrency(estimatedSavings)} saved (est.)
              </Text>
              <Text style={styles.progressPercent}>
                {Math.round(savingsProgress * 100)}%
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.progressBarFill,
                  { width: `${Math.max(savingsProgress * 100, 2)}%` },
                ]}
              />
            </View>
          </View>

          {/* Time Progress */}
          <View style={styles.timeProgressSection}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabelDim}>
                {elapsed} of {totalMonths} months elapsed
              </Text>
              <Text style={styles.progressPercentDim}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
            <View style={styles.progressBarBgDim}>
              <View
                style={[
                  styles.progressBarFillDim,
                  { width: `${Math.max(progress * 100, 2)}%` },
                ]}
              />
            </View>
          </View>
        </LinearGradient>

        {/* ── Today's Budget (the hero number) ── */}
        <View style={styles.dailyBudgetCard}>
          <Text style={styles.dailyBudgetLabel}>YOU CAN SPEND TODAY</Text>
          <Text
            style={[
              styles.dailyBudgetAmount,
              dailyRemaining < 0 && styles.dailyBudgetNegative,
            ]}
          >
            {formatCurrency(Math.abs(dailyRemaining))}
          </Text>

          {/* Budget breakdown: base + carryover */}
          <View style={styles.budgetBreakdown}>
            <View style={styles.budgetBreakdownItem}>
              <Text style={styles.budgetBreakdownLabel}>Base</Text>
              <Text style={styles.budgetBreakdownValue}>{formatCurrency(goal.dailyBudget)}</Text>
            </View>
            {carryover > 0 && (
              <>
                <Text style={styles.budgetBreakdownPlus}>+</Text>
                <View style={styles.budgetBreakdownItem}>
                  <Text style={styles.budgetBreakdownLabel}>Carried</Text>
                  <Text style={[styles.budgetBreakdownValue, { color: COLORS.success }]}>
                    {formatCurrency(carryover)}
                  </Text>
                </View>
              </>
            )}
            <Text style={styles.budgetBreakdownEquals}>=</Text>
            <View style={styles.budgetBreakdownItem}>
              <Text style={styles.budgetBreakdownLabel}>Total</Text>
              <Text style={[styles.budgetBreakdownValue, { color: COLORS.primary }]}>
                {formatCurrency(effectiveBudget)}
              </Text>
            </View>
          </View>

          {todaySpend > 0 && (
            <View style={styles.dailySpendRow}>
              <View style={styles.dailySpendBarBg}>
                <View
                  style={[
                    styles.dailySpendBarFill,
                    {
                      width: `${Math.min((todaySpend / effectiveBudget) * 100, 100)}%`,
                      backgroundColor: todaySpend <= effectiveBudget ? COLORS.success : COLORS.danger,
                    },
                  ]}
                />
              </View>
              <Text style={styles.dailyBudgetSub}>
                {formatCurrency(todaySpend)} / {formatCurrency(effectiveBudget)}
              </Text>
            </View>
          )}
          {todaySpend > effectiveBudget && (
            <View style={styles.warningBadge}>
              <Text style={styles.warningBadgeText}>Budget exceeded for today</Text>
            </View>
          )}

          {/* Auto-sync indicator */}
          <View style={styles.autoSyncBadge}>
            <Text style={styles.autoSyncBadgeText}>{'\u26A1'} Auto-synced from expenses</Text>
          </View>

          {/* Group affects goal toggle — only show when group trackers are active */}
          {trackerState.activeGroupIds.length > 0 && (
            <TouchableOpacity
              style={styles.groupGoalToggle}
              onPress={toggleGroupAffectsGoal}
              activeOpacity={0.7}
            >
              <View style={[
                styles.groupGoalToggleIndicator,
                trackerState.groupAffectsGoal && styles.groupGoalToggleOn,
              ]} />
              <Text style={styles.groupGoalToggleText}>
                {trackerState.groupAffectsGoal
                  ? 'Group expenses count toward goal'
                  : 'Group expenses excluded from goal'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Streak ── */}
        {renderStreakBadge(goal)}

        {/* ── Savings Jar ── */}
        {renderSavingsJar(goal)}

        {/* ── Monthly Breakdown ── */}
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
              <Text style={styles.monthlyItemValueGold}>
                {formatCurrency(goal.monthlyBudget)}
              </Text>
            </View>
            <View style={styles.monthlyDivider} />
            <View style={styles.monthlyItem}>
              <Text style={styles.monthlyItemLabel}>Status</Text>
              <Text
                style={[
                  styles.monthlyItemValue,
                  { color: monthSpend <= goal.monthlyBudget ? COLORS.success : COLORS.danger },
                ]}
              >
                {monthSpend <= goal.monthlyBudget ? 'On Track' : 'Over'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Financial Details ── */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Base daily budget</Text>
            <Text style={styles.detailValue}>{formatCurrency(goal.dailyBudget)}</Text>
          </View>
          <View style={styles.detailDividerThin} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Monthly set-aside for goal</Text>
            <Text style={styles.detailValueGold}>{formatCurrency(goal.monthlyBudget)}</Text>
          </View>
          <View style={styles.detailDividerThin} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Monthly savings capacity</Text>
            <Text style={styles.detailValue}>{formatCurrency(monthlySavings)}</Text>
          </View>
          <View style={styles.detailDividerThin} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Salary</Text>
            <Text style={styles.detailValueDim}>{formatCurrency(goal.salary)}</Text>
          </View>
          {goal.emis > 0 && (<>
            <View style={styles.detailDividerThin} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>EMIs</Text>
              <Text style={styles.detailValueDim}>{formatCurrency(goal.emis)}</Text>
            </View>
          </>)}
          {goal.expenses > 0 && (<>
            <View style={styles.detailDividerThin} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Rent + Bills</Text>
              <Text style={styles.detailValueDim}>{formatCurrency(goal.expenses)}</Text>
            </View>
          </>)}
          {goal.maintenance > 0 && (<>
            <View style={styles.detailDividerThin} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Maintenance</Text>
              <Text style={styles.detailValueDim}>{formatCurrency(goal.maintenance)}</Text>
            </View>
          </>)}
          {(goal.customFinances || []).filter(f => f.amount > 0).map((f, i) => (
            <React.Fragment key={i}>
              <View style={styles.detailDividerThin} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{f.label || 'Custom'}</Text>
                <Text style={styles.detailValueDim}>{formatCurrency(f.amount)}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
    );
  };

  /* ── Main Render ──────────────────────────────────────────────────── */

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen Title */}
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.screenTitle}>Savings Goals</Text>
            {goals.length > 0 && (
              <Text style={styles.screenSubtitle}>
                {goals.length} {goals.length === 1 ? 'goal' : 'goals'} active
              </Text>
            )}
          </View>
          {goals.length > 0 && (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => {
                if (!isPremium && goals.length >= FREE_GOAL_LIMIT) {
                  Alert.alert(
                    'Premium Feature',
                    'Free plan includes 2 savings goals. Upgrade to Premium for unlimited goals!',
                    [
                      { text: 'Not Now', style: 'cancel' },
                      { text: 'See Plans', onPress: () => nav.navigate('Pricing') },
                    ],
                  );
                  return;
                }
                prefillFinances();
                setShowForm(true);
              }}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={[`${COLORS.primary}25`, `${COLORS.primary}10`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.addBtnGradient}
              >
                <Text style={styles.addBtnText}>+ Add Goal</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        {/* Summary Card (when goals exist) */}
        {goals.length > 0 && (() => {
          const totalSaved = goals.reduce((s, g) => s + (g.totalSaved || 0) + (g.savingsJar || 0), 0);
          const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
          const overallProgress = totalTarget > 0 ? Math.min(totalSaved / totalTarget, 1) : 0;
          return (
            <View style={styles.summaryCard}>
              <View style={styles.summaryTopRow}>
                <View>
                  <Text style={styles.summaryLabel}>Total Saved</Text>
                  <View style={styles.summaryAmountRow}>
                    <Text style={styles.summaryAmount}>{formatCurrency(totalSaved)}</Text>
                    <Text style={styles.summaryTarget}> / {formatCurrency(totalTarget)}</Text>
                  </View>
                </View>
                <View style={styles.summaryRight}>
                  <Text style={styles.summaryLabel}>Active Goals</Text>
                  <Text style={styles.summaryGoalCount}>{goals.length}</Text>
                </View>
              </View>
              <View style={styles.summaryProgressBg}>
                <View style={[styles.summaryProgressFill, { width: `${overallProgress * 100}%` }]} />
              </View>
              <View style={styles.summaryBottomRow}>
                <View style={styles.summaryStatItem}>
                  <Text style={styles.summaryStatLabel}>Today</Text>
                  <Text style={styles.summaryStatValue}>{formatCurrency(todaySpend)}</Text>
                </View>
                <View style={styles.summaryStatItem}>
                  <Text style={styles.summaryStatLabel}>This Month</Text>
                  <Text style={styles.summaryStatValue}>{formatCurrency(monthSpend)}</Text>
                </View>
                <View style={styles.summaryStatItem}>
                  <Text style={styles.summaryStatLabel}>Streak</Text>
                  <Text style={[styles.summaryStatValue, { color: COLORS.warning }]}>
                    {Math.max(...goals.map(g => g.streak), 0)}d
                  </Text>
                </View>
              </View>
            </View>
          );
        })()}

        {goals.length === 0 && renderEmptyState()}

        {goals.map(renderGoalCard)}

        <View style={{ height: 40 }} />
      </ScrollView>

      {renderFormModal()}
      {renderLeftoverSheet()}
    </SafeAreaView>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  Styles                                                               */
/* ══════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },

  /* ── Screen Title ─────────────────────────────────────────────────── */
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
  screenSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  addBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: `${COLORS.primary}40`,
  },
  addBtnGradient: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.3,
  },

  /* ── Summary Card ─────────────────────────────────────────────────── */
  summaryCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  summaryLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  summaryAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: -0.5,
  },
  summaryTarget: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  summaryGoalCount: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
  },
  summaryProgressBg: {
    height: 8,
    backgroundColor: COLORS.surfaceHigher,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  summaryProgressFill: {
    height: 8,
    backgroundColor: COLORS.success,
    borderRadius: 4,
  },
  summaryBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryStatLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  summaryStatValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },

  /* ── Empty State ──────────────────────────────────────────────────── */
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
    borderRadius: 14,
    overflow: 'hidden',
  },
  createBtnGradient: {
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

  /* ── Modal / Form ─────────────────────────────────────────────────── */
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalScroll: {
    padding: 20,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  modalDragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surfaceHigher,
    alignSelf: 'center',
    marginBottom: 24,
  },
  formSection: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1.5,
    marginBottom: 16,
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
    paddingVertical: 13,
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

  /* ── Budget Preview ───────────────────────────────────────────────── */
  previewCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  previewGradient: {
    padding: 20,
  },
  previewTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewItem: {
    flex: 1,
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  previewDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
  },
  previewSetAside: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  previewSetAsideLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  previewSetAsideValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },

  /* ── Custom Finance Fields ───────────────────────────────────────── */
  customFinanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  removeCustomBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  removeCustomBtnText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  addCustomBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addCustomBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  /* ── Submit Button ────────────────────────────────────────────────── */
  submitBtn: {
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

  /* ── Goal Card ────────────────────────────────────────────────────── */
  goalCard: {
    marginBottom: 24,
  },
  goalHeader: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 18,
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
    marginBottom: 14,
  },
  goalHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  goalName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  goalTarget: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -1,
    marginBottom: 8,
  },
  goalDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goalDateText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    letterSpacing: 0.2,
  },
  goalDaysChip: {
    backgroundColor: `${COLORS.primary}20`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  goalDaysText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.3,
  },
  goalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: `${COLORS.primary}12`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.primary}20`,
  },
  editBtnIcon: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: `${COLORS.danger}12`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.danger}20`,
  },
  deleteBtnIcon: {
    fontSize: 14,
    color: COLORS.danger,
    fontWeight: '600',
  },

  /* ── Progress Bars ────────────────────────────────────────────────── */
  savingsProgressSection: {
    marginBottom: 10,
  },
  timeProgressSection: {
    marginTop: 2,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    letterSpacing: 0.2,
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
    borderRadius: 3,
  },
  progressLabelDim: {
    fontSize: 11,
    color: COLORS.textLight,
    letterSpacing: 0.2,
  },
  progressPercentDim: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  progressBarBgDim: {
    height: 4,
    backgroundColor: COLORS.surfaceHigher,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFillDim: {
    height: 4,
    backgroundColor: COLORS.textSecondary,
    borderRadius: 2,
  },

  /* ── Daily Budget ─────────────────────────────────────────────────── */
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
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: -1,
  },
  dailyBudgetNegative: {
    color: COLORS.danger,
  },
  dailySpendRow: {
    width: '100%',
    marginTop: 12,
    alignItems: 'center',
  },
  dailySpendBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: COLORS.surfaceHigher,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  dailySpendBarFill: {
    height: 4,
    borderRadius: 2,
  },
  dailyBudgetSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
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

  /* ── Streak ───────────────────────────────────────────────────────── */
  streakCard: {
    backgroundColor: COLORS.surface,
    padding: 18,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  streakTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  streakCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  streakEmoji: {
    fontSize: 24,
  },
  streakCount: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  streakMeta: {
    marginLeft: 4,
  },
  streakDayLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  streakTierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  streakTierText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  streakDotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  streakDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  streakHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
  },

  /* ── Monthly Breakdown ────────────────────────────────────────────── */
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

  /* ── Goal Details ─────────────────────────────────────────────────── */
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
    paddingVertical: 7,
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
  detailValueGold: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  detailValueDim: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  detailDividerThin: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: 1,
  },

  /* ── Empty state auto-sync ─────────────────────────────────────────── */
  emptyAutoSync: {
    fontSize: 12,
    color: COLORS.success,
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '600',
  },

  /* ── Auto-sync badge ───────────────────────────────────────────────── */
  autoSyncBadge: {
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: `${COLORS.success}10`,
  },
  autoSyncBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.success,
    letterSpacing: 0.3,
  },

  /* ── Group goal toggle ────────────────────────────────────────────── */
  groupGoalToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  groupGoalToggleIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.textSecondary,
  },
  groupGoalToggleOn: {
    backgroundColor: COLORS.success,
  },
  groupGoalToggleText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    flex: 1,
  },

  /* ── Budget breakdown ──────────────────────────────────────────────── */
  budgetBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 6,
  },
  budgetBreakdownItem: {
    alignItems: 'center',
  },
  budgetBreakdownLabel: {
    fontSize: 9,
    color: COLORS.textLight,
    letterSpacing: 0.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  budgetBreakdownValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  budgetBreakdownPlus: {
    fontSize: 14,
    color: COLORS.success,
    fontWeight: '700',
    marginTop: 8,
  },
  budgetBreakdownEquals: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginTop: 8,
  },

  /* ── Leftover Bottom Sheet ─────────────────────────────────────────── */
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 0,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surfaceHigher,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.success,
    textAlign: 'center',
    letterSpacing: -1,
    marginBottom: 8,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  sheetBtnPrimary: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  sheetBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    gap: 14,
  },
  sheetBtnIcon: {
    fontSize: 28,
  },
  sheetBtnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  sheetBtnSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  sheetBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceHigh,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    marginBottom: 16,
  },
  sheetBtnSecondaryIcon: {
    fontSize: 24,
  },
  sheetBtnSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  sheetBtnSubDim: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  sheetAutoNote: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
  },

  /* ── Savings Jar ──────────────────────────────────────────────────── */
  jarCard: {
    backgroundColor: COLORS.surfaceHigh,
    padding: 18,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  jarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  jarEmoji: {
    fontSize: 24,
  },
  jarTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  jarAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  jarSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 14,
  },
  jarEmptySub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 10,
  },
  jarInvestBtn: {
    backgroundColor: `${COLORS.success}15`,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: `${COLORS.success}30`,
    marginBottom: 12,
  },
  jarInvestBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.success,
  },
  jarLifetime: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  jarLifetimeLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  jarLifetimeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
