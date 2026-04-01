import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
  RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, AppState, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import { usePremium } from '../store/PremiumContext';
import { getTransactions, getGoals, computeTodaySpendFromTransactions, deleteTransaction, saveTransaction, getSubscriptions, getInvestments, getEMIs } from '../services/StorageService';
import { getOverallBudget, getBudgetStatus, setBudget, deleteBudget, BudgetStatus } from '../services/BudgetService';
import { getTodayPendingCount } from '../services/TransactionSignalEngine';
import { Transaction, SavingsGoal, UserSubscriptionItem, InvestmentItem, EMIItem } from '../models/types';
import AnimatedAmount from '../components/AnimatedAmount';
import { HeroCardSkeleton } from '../components/SkeletonLoader';
// ActiveTrackerBanner removed — trackers now shown inline in scroll view
import TrackerSelectionDialog from '../components/TrackerSelectionDialog';
import UndoToast from '../components/UndoToast';
import { checkOverdueSubscriptions, skipOverdueSubscription, removeOverdueSubscription, checkEMICompletions, OverdueSubscription, EMICompletionResult } from '../services/AutoDetectionService';
import { COLORS, formatCurrency } from '../utils/helpers';
import { useTheme } from '../store/ThemeContext';
import PressableScale from '../components/PressableScale';
import { useTour } from '../store/TourContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { groups } = useGroups();
  const { isPremium } = usePremium();
  const { colors, isDark } = useTheme();
  const {
    trackerState, getActiveTrackers, pendingTransaction, pendingGroupTracker,
    pendingTargetTracker, clearPendingTransaction, addTransactionToTracker,
    transactionVersion, setDefaultTracker,
    togglePersonal, toggleReimbursement, toggleGroup, toggleTracking,
  } = useTracker();

  const [totalSpent, setTotalSpent] = useState(0);
  const [monthSpent, setMonthSpent] = useState(0);
  const [monthCount, setMonthCount] = useState(0);
  const [budgetStatus, setBudgetStatusState] = useState<BudgetStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Budget editing modal
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  // Goal daily budget display
  const [activeGoal, setActiveGoal] = useState<SavingsGoal | null>(null);
  const [todaySpend, setTodaySpend] = useState(0);

  // Pending review count
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  // Finance trackers
  const [subscriptions, setSubscriptions] = useState<UserSubscriptionItem[]>([]);
  const [investments, setInvestments] = useState<InvestmentItem[]>([]);
  const [emis, setEMIs] = useState<EMIItem[]>([]);

  // Overdue subscription popup
  const [overdueItems, setOverdueItems] = useState<OverdueSubscription[]>([]);
  const [showOverdueModal, setShowOverdueModal] = useState(false);

  // EMI completion celebration
  const [showEMICelebration, setShowEMICelebration] = useState(false);
  const [completedEMI, setCompletedEMI] = useState<EMICompletionResult | null>(null);

  // Undo toast
  const [undoState, setUndoState] = useState<{ visible: boolean; message: string; txn: Transaction | null }>({ visible: false, message: '', txn: null });

  // Tracker picker bottom sheet
  const [showTrackerPicker, setShowTrackerPicker] = useState(false);

  // Parallax
  const scrollY = useRef(new Animated.Value(0)).current;

  // Tour spotlight refs
  const { registerElement } = useTour();
  const trackersRef = useRef<View>(null);
  const toggleRef = useRef<View>(null);
  const reviewRef = useRef<View>(null);

  useEffect(() => {
    registerElement('activeTrackers', trackersRef);
    registerElement('trackingToggle', toggleRef);
    registerElement('reviewExpenses', reviewRef);
  }, [registerElement]);

  const activeTrackers = getActiveTrackers(groups);

  // Auto-open SplitEditor when a group tracker is auto-routed from notification
  useEffect(() => {
    if (pendingTransaction && pendingGroupTracker) {
      const txn = pendingTransaction;
      const tracker = pendingGroupTracker;
      nav.navigate('SplitEditor', {
        groupId: tracker.id,
        amount: txn.amount,
        description: txn.merchant
          ? `Payment at ${txn.merchant}`
          : undefined,
        merchant: txn.merchant || undefined,
      });
      clearPendingTransaction();
    }
  }, [pendingTransaction, pendingGroupTracker]);

  // Auto-save + navigate when personal/reimbursement notification is tapped
  useEffect(() => {
    if (pendingTransaction && pendingTargetTracker && !pendingGroupTracker) {
      const txn = pendingTransaction;
      const tracker = pendingTargetTracker;
      (async () => {
        await addTransactionToTracker(txn, tracker.type, tracker.id);
        clearPendingTransaction();
        // Navigate to the correct screen
        if (tracker.type === 'personal') {
          nav.navigate('MainTabs', { screen: 'Personal' } as any);
        } else if (tracker.type === 'reimbursement') {
          nav.navigate('Reimbursement');
        }
      })();
    }
  }, [pendingTransaction, pendingTargetTracker, pendingGroupTracker]);

  const loadTransactions = useCallback(async () => {
    const personalOnly = await getTransactions('personal');
    setTotalSpent(personalOnly.reduce((s, t) => s + t.amount, 0));

    const now = new Date();
    const thisMonth = personalOnly.filter(t => {
      const d = new Date(t.timestamp);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const ms = thisMonth.reduce((s, t) => s + t.amount, 0);
    setMonthSpent(ms);
    setMonthCount(thisMonth.length);

    const budget = await getOverallBudget();
    setBudgetStatusState(budget ? getBudgetStatus(budget, ms) : null);

    const goals = await getGoals();
    if (goals.length > 0) {
      setActiveGoal(goals[0]);
      const ts = await computeTodaySpendFromTransactions();
      setTodaySpend(ts);
    } else {
      setActiveGoal(null);
    }

    const pendingCount = await getTodayPendingCount();
    setPendingReviewCount(pendingCount);

    // Load finance trackers
    const subs = await getSubscriptions();
    setSubscriptions(subs.filter(s => s.active));
    const invs = await getInvestments();
    setInvestments(invs.filter(i => i.active));
    const ems = await getEMIs();
    setEMIs(ems.filter(e => e.active));

    // Check for completed EMIs (celebration)
    const completedEMIs = await checkEMICompletions();
    if (completedEMIs.length > 0) {
      setCompletedEMI(completedEMIs[0]);
      setShowEMICelebration(true);
    }

    // Check for overdue subscriptions (missed payment popup)
    const overdue = await checkOverdueSubscriptions();
    if (overdue.length > 0) {
      setOverdueItems(overdue);
      setShowOverdueModal(true);
    }

    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    loadTransactions();
  }, [loadTransactions, transactionVersion]));

  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        loadTransactions();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [loadTransactions]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  };

  const handleSaveBudget = async () => {
    const amount = parseFloat(budgetInput);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid', 'Please enter a valid amount.');
      return;
    }
    await setBudget('overall', amount);
    setShowBudgetModal(false);
    setBudgetInput('');
    await loadTransactions();
  };

  const handleDeleteBudget = async () => {
    Alert.alert('Remove Budget', 'Are you sure you want to remove your monthly budget?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteBudget('overall');
          setShowBudgetModal(false);
          setBudgetInput('');
          await loadTransactions();
        },
      },
    ]);
  };

  const openBudgetModal = () => {
    if (budgetStatus) {
      setBudgetInput(String(budgetStatus.budget.amount));
    } else {
      setBudgetInput('');
    }
    setShowBudgetModal(true);
  };

  const handleUndo = async () => {
    if (undoState.txn) {
      const txn = undoState.txn;
      await saveTransaction(
        { amount: txn.amount, type: 'debit', merchant: txn.merchant, rawMessage: txn.rawMessage || '', timestamp: txn.timestamp },
        txn.trackerType,
        txn.userId,
        txn.groupId,
      );
      await loadTransactions();
    }
    setUndoState({ visible: false, message: '', txn: null });
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const contextualSubtext = useMemo(() => {
    if (budgetStatus && budgetStatus.percentage > 80) return 'Budget\'s getting tight — stay mindful';
    return 'Your finances at a glance';
  }, [budgetStatus]);

  // Parallax for hero card
  const heroScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.08, 1],
    extrapolate: 'clamp',
  });

  // Savings jar amount
  const savingsRemaining = activeGoal
    ? Math.max(activeGoal.dailyBudget - todaySpend, 0)
    : 0;

  // Subscriptions monthly total
  const subsMonthly = subscriptions.reduce((sum, s) => {
    return sum + (s.cycle === 'monthly' ? s.amount : s.amount / 12);
  }, 0);

  // Investments monthly total
  const investMonthly = investments.reduce((sum, i) => {
    if (i.cycle === 'one-time') return sum;
    return sum + (i.cycle === 'monthly' ? i.amount : i.amount / 12);
  }, 0);

  // EMI monthly total
  const emiMonthly = emis.reduce((sum, e) => sum + e.amount, 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>{greeting()}</Text>
          <Text style={[styles.name, { color: colors.text }]}>{user?.displayName || 'User'}</Text>
          <Text style={[styles.contextSub, { color: colors.textLight }]}>{contextualSubtext}</Text>
        </View>

        {/* Active Trackers — slot cards (max 3) with master toggle */}
        <View ref={trackersRef} style={styles.trackersSection} collapsable={false}>
          <View style={styles.trackersHeader}>
            <View style={styles.trackersHeaderLeft}>
              <View style={[styles.trackerPulse, { backgroundColor: activeTrackers.length > 0 && trackerState.trackingEnabled !== false ? colors.success : colors.textLight }]} />
              <Text style={[styles.trackersTitle, { color: colors.text }]}>Active Trackers</Text>
              <Text style={[styles.trackersCount, { color: activeTrackers.length > 0 && trackerState.trackingEnabled !== false ? colors.success : colors.textLight }]}>
                {activeTrackers.length}/3
              </Text>
            </View>
            <View ref={toggleRef} collapsable={false} style={{ opacity: activeTrackers.length === 0 ? 0.4 : 1 }}>
              <Switch
                value={activeTrackers.length > 0 && trackerState.trackingEnabled !== false}
                disabled={activeTrackers.length === 0}
                onValueChange={() => {
                  const isPausing = trackerState.trackingEnabled !== false;
                  if (isPausing && activeGoal) {
                    Alert.alert(
                      'Pause Tracking?',
                      'You have an active savings goal. Pausing tracking means expenses won\'t be counted against your daily budget.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Pause Anyway', style: 'destructive', onPress: toggleTracking },
                      ],
                    );
                  } else {
                    toggleTracking();
                  }
                }}
                trackColor={{ false: colors.surfaceHigher, true: `${colors.success}50` }}
                thumbColor={activeTrackers.length > 0 && trackerState.trackingEnabled !== false ? colors.success : colors.textLight}
                style={styles.masterToggle}
              />
            </View>
          </View>
          {activeTrackers.length > 0 && trackerState.trackingEnabled === false && (
            <Text style={[styles.pausedHint, { color: colors.warning }]}>Tracking paused — slots remembered</Text>
          )}

          {activeTrackers.length === 0 ? (
            /* Empty state — example tracker cards + add CTA */
            <>
              {/* Example cards to show what trackers look like */}
              <View style={[styles.slotRow, { opacity: 0.35 }]} pointerEvents="none">
                <View style={[styles.slotCard, { flex: 1, backgroundColor: colors.surface, borderColor: `${colors.personalColor}25`, borderLeftColor: colors.personalColor }]}>
                  <Text style={styles.slotEmoji}>💳</Text>
                  <Text style={[styles.slotLabel, { color: colors.text }]} numberOfLines={1}>Personal</Text>
                  <Text style={[styles.slotSub, { color: colors.textSecondary }]} numberOfLines={1}>Spending</Text>
                </View>
                <View style={[styles.slotCard, { flex: 1, backgroundColor: colors.surface, borderColor: `${colors.groupColor}25`, borderLeftColor: colors.groupColor }]}>
                  <Text style={styles.slotEmoji}>👥</Text>
                  <Text style={[styles.slotLabel, { color: colors.text }]} numberOfLines={1}>Flatmates</Text>
                  <Text style={[styles.slotSub, { color: colors.textSecondary }]} numberOfLines={1}>3 members</Text>
                </View>
                <View style={[styles.slotCard, { flex: 0.6, backgroundColor: colors.surface, borderColor: `${colors.reimbursementColor}25`, borderLeftColor: colors.reimbursementColor }]}>
                  <Text style={styles.slotEmoji}>🧾</Text>
                  <Text style={[styles.slotLabel, { color: colors.text }]} numberOfLines={1}>Office</Text>
                  <Text style={[styles.slotSub, { color: colors.textSecondary }]} numberOfLines={1}>Trips</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.slotEmpty, styles.slotEmptyFull, { borderColor: `${colors.primary}50`, backgroundColor: `${colors.primary}08`, marginTop: 8 }]}
                onPress={() => setShowTrackerPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.slotAddIcon, { color: colors.primary }]}>+</Text>
                <Text style={[styles.slotAddLabel, { color: colors.primary }]}>Add your first tracker</Text>
                <Text style={[styles.slotAddHint, { color: colors.textSecondary }]}>
                  Get notified when money leaves your account{'\n'}and route it to Personal, Group, or Reimbursement
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            /* Slot cards row — dimmed when tracking is paused */
            <View style={[styles.slotRow, trackerState.trackingEnabled === false && { opacity: 0.45 }]}>
              {activeTrackers.map((tracker) => {
                const slotColor = tracker.type === 'personal' ? colors.personalColor
                  : tracker.type === 'reimbursement' ? colors.reimbursementColor
                  : colors.groupColor;
                const emoji = tracker.type === 'personal' ? '💳'
                  : tracker.type === 'reimbursement' ? '🧾' : '👥';
                const subtitle = tracker.type === 'personal' ? 'Spending'
                  : tracker.type === 'reimbursement' ? 'Office'
                  : `${groups.find(g => g.id === tracker.id)?.members.length || 0} members`;

                return (
                  <View
                    key={tracker.id}
                    style={[
                      styles.slotCard,
                      {
                        flex: activeTrackers.length === 1 ? 2.5 : 1,
                        backgroundColor: colors.surface,
                        borderColor: `${slotColor}25`,
                        borderLeftColor: slotColor,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.slotRemove}
                      onPress={() => {
                        if (tracker.type === 'personal' && activeGoal) {
                          Alert.alert(
                            'Remove Personal Tracker?',
                            'You have an active savings goal. Removing this tracker means expenses won\'t be counted against your daily budget.',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Remove Anyway', style: 'destructive', onPress: () => togglePersonal() },
                            ],
                          );
                        } else if (tracker.type === 'personal') togglePersonal();
                        else if (tracker.type === 'reimbursement') toggleReimbursement();
                        else toggleGroup(tracker.id);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={[styles.slotRemoveText, { color: colors.textLight }]}>✕</Text>
                    </TouchableOpacity>
                    <Text style={styles.slotEmoji}>{emoji}</Text>
                    <Text style={[styles.slotLabel, { color: colors.text }]} numberOfLines={1}>{tracker.label}</Text>
                    <Text style={[styles.slotSub, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
                  </View>
                );
              })}

              {/* Add button — only when < 3 slots filled */}
              {activeTrackers.length < 3 && (
                <TouchableOpacity
                  style={[
                    styles.slotAdd,
                    {
                      flex: activeTrackers.length === 1 ? 1 : 0.6,
                      borderColor: `${colors.primary}25`,
                      backgroundColor: `${colors.primary}04`,
                    },
                  ]}
                  onPress={() => setShowTrackerPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.slotAddIconSmall, { color: colors.primary }]}>+</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Hero card — Total Spent with streak on top-right */}
        {loading ? (
          <HeroCardSkeleton />
        ) : (
          <Animated.View style={{ transform: [{ scale: heroScale }] }}>
            <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.heroGoldLine, { backgroundColor: colors.primary }]} />

              {/* Streak badge top-right */}
              {activeGoal && activeGoal.streak > 0 && (
                <View style={[styles.streakBadge, { backgroundColor: `${colors.primary}12` }]}>
                  <Text style={styles.streakIcon}>🔥</Text>
                  <Text style={[styles.streakText, { color: colors.primary }]}>{activeGoal.streak}d</Text>
                </View>
              )}

              <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>TOTAL SPENT</Text>
              <AnimatedAmount value={totalSpent} style={[styles.heroAmount, { color: colors.text }]} />
              <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                {monthCount > 0
                  ? `${monthCount} transactions this month`
                  : 'No transactions yet'}
              </Text>

              {budgetStatus ? (
                <TouchableOpacity onPress={openBudgetModal} activeOpacity={0.7}>
                  <View style={[styles.budgetInline, { borderTopColor: colors.border }]}>
                    <View style={styles.budgetRow}>
                      <Text style={[styles.budgetMessage, { color: budgetStatus.color }]}>{budgetStatus.message}</Text>
                      <Text style={[styles.budgetDetail, { color: colors.textSecondary }]}>{formatCurrency(Math.max(budgetStatus.budget.amount - budgetStatus.spent, 0))} left</Text>
                    </View>
                    <View style={[styles.budgetTrack, { backgroundColor: colors.surfaceHigh }]}>
                      <View style={[styles.budgetFill, { width: `${Math.min(budgetStatus.percentage, 100)}%`, backgroundColor: budgetStatus.color }]} />
                    </View>
                    <Text style={[styles.budgetEditHint, { color: colors.textLight }]}>Tap to edit budget</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={openBudgetModal} activeOpacity={0.7}>
                  <View style={[styles.budgetInline, { borderTopColor: colors.border }]}>
                    <Text style={[styles.setBudgetText, { color: colors.primary }]}>+ Set monthly budget</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}

        {/* Metrics Row — Today's Jar + This Month (no streak card) */}
        <View style={styles.metricsRow}>
          {/* Today's Budget / Savings Jar */}
          <PressableScale style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => nav.navigate('Goals')}>
            <Text style={styles.metricIcon}>🏺</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>TODAY'S JAR</Text>
            {activeGoal ? (
              <>
                <Text style={[styles.metricValue, { color: colors.text }, todaySpend > activeGoal.dailyBudget && { color: colors.danger }]}>
                  {formatCurrency(savingsRemaining)}
                </Text>
                <Text style={[styles.metricSub, { color: colors.textSecondary }]}>of {formatCurrency(activeGoal.dailyBudget)}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.metricValue, { fontSize: 14, color: colors.textSecondary }]}>No goal set</Text>
                <Text style={[styles.metricSub, { color: colors.textSecondary }]}>Tap to create</Text>
              </>
            )}
          </PressableScale>

          {/* This Month */}
          <PressableScale style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => (nav as any).navigate('Insights')}>
            <Text style={styles.metricIcon}>📊</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>THIS MONTH</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>{formatCurrency(monthSpent)}</Text>
            <Text style={[styles.metricSub, { color: colors.textSecondary }]}>{monthCount} txns</Text>
          </PressableScale>
        </View>

        {/* Review Expenses — always visible, premium-gated */}
        <View ref={reviewRef} collapsable={false} style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: `${colors.personalColor}15` }]}>
          <PressableScale
            style={styles.reviewPressable}
            onPress={() => nav.navigate('NightlyReview')}
          >
            <View style={styles.reviewLeft}>
              <View style={styles.reviewIconRow}>
                <Text style={styles.reviewEmoji}>🌙</Text>
                {!isPremium && (
                  <View style={[styles.premiumBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.premiumBadgeText}>PRO</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.reviewTitle, { color: colors.text }]}>Review Expenses</Text>
              <Text style={[styles.reviewSub, { color: colors.textSecondary }]}>
                {pendingReviewCount > 0
                  ? `${pendingReviewCount} transaction${pendingReviewCount > 1 ? 's' : ''} to review`
                  : 'All caught up'}
              </Text>
            </View>
            {pendingReviewCount > 0 && (
              <View style={styles.reviewBadge}>
                <Text style={styles.reviewBadgeText}>{pendingReviewCount}</Text>
              </View>
            )}
          </PressableScale>
          {activeTrackers.length > 0 && (
            <View style={[styles.reviewTrackerRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.reviewTrackerLabel, { color: colors.textLight }]}>Routing to</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewTrackerChips}>
                {activeTrackers.map(t => {
                  const isDefault = t.id === trackerState.defaultTrackerId;
                  const chipColor = t.type === 'personal' ? colors.personalColor
                    : t.type === 'reimbursement' ? colors.reimbursementColor
                    : colors.groupColor;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.reviewTrackerChip,
                        { backgroundColor: `${chipColor}10`, borderColor: `${chipColor}30` },
                        isDefault && { backgroundColor: `${chipColor}18`, borderColor: chipColor },
                      ]}
                      onPress={() => setDefaultTracker(t.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.reviewTrackerDot, { backgroundColor: chipColor }]} />
                      <Text style={[styles.reviewTrackerChipText, { color: isDefault ? chipColor : colors.textSecondary }]}>
                        {t.label}{isDefault ? ' (Default)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Goal Budget Card */}
        {activeGoal && (
          <PressableScale style={[styles.goalBudgetCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => nav.navigate('Goals')}>
            <View style={styles.goalBudgetLeft}>
              <Text style={[styles.goalBudgetLabel, { color: colors.textSecondary }]}>ACTIVE GOAL</Text>
              <Text style={[styles.goalBudgetName, { color: colors.text }]}>{activeGoal.name}</Text>
            </View>
            <View style={styles.goalBudgetRight}>
              <Text style={[styles.goalBudgetAmount, { color: colors.success }, todaySpend > activeGoal.dailyBudget && { color: colors.danger }]}>
                {formatCurrency(Math.max(activeGoal.dailyBudget - todaySpend, 0))}
              </Text>
              <Text style={[styles.goalBudgetSub, { color: colors.textSecondary }]}>left today</Text>
            </View>
          </PressableScale>
        )}

        {/* Subscriptions Card */}
        <PressableScale
          style={[styles.financeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => nav.navigate('Subscriptions')}
        >
          <View style={styles.financeLeft}>
            <Text style={styles.financeEmoji}>🔄</Text>
            <View>
              <Text style={[styles.financeTitle, { color: colors.text }]}>Subscriptions</Text>
              <Text style={[styles.financeSub, { color: colors.textSecondary }]}>
                {subscriptions.length > 0
                  ? `${subscriptions.length} active · ${formatCurrency(subsMonthly)}/mo`
                  : 'e.g. Netflix, Spotify, iCloud — auto-detected'}
              </Text>
            </View>
          </View>
          <Text style={[styles.financeArrow, { color: colors.textSecondary }]}>›</Text>
        </PressableScale>

        {/* Investments Card */}
        <PressableScale
          style={[styles.financeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => nav.navigate('Investments')}
        >
          <View style={styles.financeLeft}>
            <Text style={styles.financeEmoji}>📈</Text>
            <View>
              <Text style={[styles.financeTitle, { color: colors.text }]}>Investments</Text>
              <Text style={[styles.financeSub, { color: colors.textSecondary }]}>
                {investments.length > 0
                  ? `${investments.length} active · ${formatCurrency(investMonthly)}/mo`
                  : 'e.g. SIP, Mutual Funds — auto-detected'}
              </Text>
            </View>
          </View>
          <Text style={[styles.financeArrow, { color: colors.textSecondary }]}>›</Text>
        </PressableScale>

        {/* EMIs Card */}
        <PressableScale
          style={[styles.financeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => nav.navigate('EMIs')}
        >
          <View style={styles.financeLeft}>
            <Text style={styles.financeEmoji}>🏦</Text>
            <View>
              <Text style={[styles.financeTitle, { color: colors.text }]}>EMIs</Text>
              <Text style={[styles.financeSub, { color: colors.textSecondary }]}>
                {emis.length > 0
                  ? `${emis.length} active · ${formatCurrency(emiMonthly)}/mo`
                  : 'e.g. Home Loan, Car Loan — auto-detected'}
              </Text>
            </View>
          </View>
          <Text style={[styles.financeArrow, { color: colors.textSecondary }]}>›</Text>
        </PressableScale>

        {/* Privacy Shield — subtle, hidden for premium users */}
        {!loading && !isPremium && monthCount === 0 && (
          <View style={styles.privacyCard}>
            <Text style={styles.privacyText}>
              🛡️ Trackk wakes up only when an expense happens. Zero battery drain.
            </Text>
          </View>
        )}

        <View style={{ height: 20 }} />
      </Animated.ScrollView>

      {/* Budget editing modal */}
      <Modal visible={showBudgetModal} animationType="slide" transparent onRequestClose={() => setShowBudgetModal(false)}>
        <KeyboardAvoidingView behavior="padding" style={styles.budgetModalOverlay}>
          <View style={styles.budgetModalContainer}>
            <View style={styles.budgetModalHandle} />
            <Text style={styles.budgetModalTitle}>{budgetStatus ? 'Edit Monthly Budget' : 'Set Monthly Budget'}</Text>
            <Text style={styles.budgetModalSub}>How much do you want to spend per month?</Text>
            <TextInput
              style={styles.budgetModalInput}
              value={budgetInput}
              onChangeText={setBudgetInput}
              placeholder="e.g. 30000"
              placeholderTextColor={colors.textLight}
              keyboardType="numeric"
              autoFocus
              selectionColor={colors.primary}
            />
            <TouchableOpacity style={[styles.budgetModalSaveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveBudget} activeOpacity={0.8}>
              <Text style={styles.budgetModalSaveBtnText}>{budgetStatus ? 'Update Budget' : 'Set Budget'}</Text>
            </TouchableOpacity>
            {budgetStatus && (
              <TouchableOpacity style={styles.budgetModalDeleteBtn} onPress={handleDeleteBudget} activeOpacity={0.7}>
                <Text style={styles.budgetModalDeleteBtnText}>Remove Budget</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.budgetModalCancelBtn} onPress={() => setShowBudgetModal(false)}>
              <Text style={styles.budgetModalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Tracker selection dialog */}
      <TrackerSelectionDialog
        visible={!!pendingTransaction && !pendingGroupTracker}
        transaction={pendingTransaction}
        trackers={activeTrackers}
        onSelect={async tracker => {
          if (pendingTransaction) {
            const txn = pendingTransaction;
            if (tracker.type === 'group') {
              nav.navigate('SplitEditor', {
                groupId: tracker.id,
                amount: txn.amount,
                description: txn.merchant ? `Payment at ${txn.merchant}` : undefined,
                merchant: txn.merchant || undefined,
              });
              clearPendingTransaction();
            } else {
              await addTransactionToTracker(txn, tracker.type, tracker.id);
              clearPendingTransaction();
              await loadTransactions();
            }
          }
        }}
        onIgnore={clearPendingTransaction}
      />

      {/* Quick Add FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
        onPress={() => nav.navigate('QuickAdd', undefined)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>Quick Add</Text>
      </TouchableOpacity>

      {/* Overdue Subscription Popup */}
      <Modal visible={showOverdueModal} transparent animationType="fade">
        <View style={styles.overdueOverlay}>
          <View style={styles.overdueContent}>
            {overdueItems.length > 0 && (
              <>
                <Text style={styles.overdueEmoji}>⚠️</Text>
                <Text style={styles.overdueTitle}>
                  {overdueItems[0].subscription.name} payment not detected
                </Text>
                <Text style={styles.overdueSub}>
                  {overdueItems[0].daysPastDue} days past billing date
                  {overdueItems[0].possiblyPaidByOther ? '\nSomeone else in the group may have paid' : ''}
                </Text>
                <TouchableOpacity
                  style={styles.overdueRemoveBtn}
                  onPress={async () => {
                    await removeOverdueSubscription(overdueItems[0].subscription.id);
                    const remaining = overdueItems.slice(1);
                    setOverdueItems(remaining);
                    if (remaining.length === 0) setShowOverdueModal(false);
                    loadTransactions();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.overdueRemoveText}>Remove subscription</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.overdueSkipBtn}
                  onPress={async () => {
                    await skipOverdueSubscription(overdueItems[0].subscription.id);
                    const remaining = overdueItems.slice(1);
                    setOverdueItems(remaining);
                    if (remaining.length === 0) setShowOverdueModal(false);
                    loadTransactions();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.overdueSkipText}>Skip — show next month's date</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* EMI Completion Celebration */}
      <Modal visible={showEMICelebration} transparent animationType="fade">
        <View style={styles.overdueOverlay}>
          <View style={styles.celebrationContent}>
            <Text style={styles.celebrationEmoji}>🎉</Text>
            <Text style={styles.celebrationTitle}>Bravoooo!</Text>
            <Text style={styles.celebrationSub}>
              Your {completedEMI?.name} EMI is fully paid!{'\n'}One less thing to worry about.
            </Text>
            <View style={styles.celebrationBadge}>
              <Text style={styles.celebrationBadgeText}>EMI CLOSED</Text>
            </View>
            <TouchableOpacity style={[styles.celebrationBtn, { backgroundColor: colors.success }]} onPress={() => setShowEMICelebration(false)} activeOpacity={0.8}>
              <Text style={styles.celebrationBtnText}>Amazing!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Undo Toast */}
      <UndoToast
        visible={undoState.visible}
        message={undoState.message}
        onUndo={handleUndo}
        onDismiss={() => setUndoState({ visible: false, message: '', txn: null })}
      />

      {/* Tracker Picker Bottom Sheet */}
      <Modal visible={showTrackerPicker} animationType="slide" transparent onRequestClose={() => setShowTrackerPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowTrackerPicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.surfaceHigher }]} />
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Add Tracker</Text>
            <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>Choose what to track in notifications</Text>

            {/* Personal option */}
            {!trackerState.personal && (
              <TouchableOpacity
                style={[styles.pickerOption, { borderColor: `${colors.personalColor}20`, backgroundColor: `${colors.personalColor}05` }]}
                onPress={() => { togglePersonal(); setShowTrackerPicker(false); }}
                activeOpacity={0.7}
              >
                <View style={[styles.pickerOptionDot, { backgroundColor: colors.personalColor }]} />
                <Text style={styles.pickerOptionEmoji}>💳</Text>
                <View style={styles.pickerOptionText}>
                  <Text style={[styles.pickerOptionLabel, { color: colors.text }]}>Personal Expenses</Text>
                  <Text style={[styles.pickerOptionSub, { color: colors.textSecondary }]}>Daily spending</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Reimbursement option */}
            {!trackerState.reimbursement && (
              <TouchableOpacity
                style={[styles.pickerOption, { borderColor: `${colors.reimbursementColor}20`, backgroundColor: `${colors.reimbursementColor}05` }]}
                onPress={() => { toggleReimbursement(); setShowTrackerPicker(false); }}
                activeOpacity={0.7}
              >
                <View style={[styles.pickerOptionDot, { backgroundColor: colors.reimbursementColor }]} />
                <Text style={styles.pickerOptionEmoji}>🧾</Text>
                <View style={styles.pickerOptionText}>
                  <Text style={[styles.pickerOptionLabel, { color: colors.text }]}>Reimbursement</Text>
                  <Text style={[styles.pickerOptionSub, { color: colors.textSecondary }]}>Office expenses</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Group options */}
            {groups.filter(g => !trackerState.activeGroupIds.includes(g.id) && !g.archived).length > 0 && (
              <>
                <Text style={[styles.pickerSectionTitle, { color: colors.textSecondary }]}>GROUPS</Text>
                {groups
                  .filter(g => !trackerState.activeGroupIds.includes(g.id) && !g.archived)
                  .map(g => (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.pickerOption, { borderColor: `${colors.groupColor}20`, backgroundColor: `${colors.groupColor}05` }]}
                      onPress={() => { toggleGroup(g.id); setShowTrackerPicker(false); }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.pickerOptionDot, { backgroundColor: colors.groupColor }]} />
                      <Text style={styles.pickerOptionEmoji}>👥</Text>
                      <View style={styles.pickerOptionText}>
                        <Text style={[styles.pickerOptionLabel, { color: colors.text }]}>{g.name}</Text>
                        <Text style={[styles.pickerOptionSub, { color: colors.textSecondary }]}>{g.members.length} members</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                }
              </>
            )}

            <TouchableOpacity style={styles.pickerCancel} onPress={() => setShowTrackerPicker(false)}>
              <Text style={[styles.pickerCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 80 },

  header: { marginBottom: 24, marginTop: 8 },
  greeting: { fontSize: 14, letterSpacing: 0.3 },
  name: { fontSize: 28, fontWeight: '700', marginTop: 2, letterSpacing: -0.3 },
  contextSub: { fontSize: 12, marginTop: 4, letterSpacing: 0.2 },

  /* Active Trackers — slot cards */
  trackersSection: { marginBottom: 16 },
  trackersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  trackersHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackerPulse: { width: 8, height: 8, borderRadius: 4 },
  trackersTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  trackersCount: { fontSize: 11, fontWeight: '600' },
  masterToggle: { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] },
  pausedHint: { fontSize: 11, fontWeight: '500', marginBottom: 8 },

  /* Slot row */
  slotRow: { flexDirection: 'row', gap: 8 },

  /* Filled slot card */
  slotCard: { borderRadius: 14, padding: 14, borderWidth: 1, borderLeftWidth: 3, position: 'relative', minHeight: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  slotRemove: { position: 'absolute', top: 8, right: 8, zIndex: 1, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  slotRemoveText: { fontSize: 12, fontWeight: '600' },
  slotEmoji: { fontSize: 20, marginBottom: 6 },
  slotLabel: { fontSize: 13, fontWeight: '600', marginBottom: 2, paddingRight: 18 },
  slotSub: { fontSize: 10 },

  /* Add slot button */
  slotAdd: { borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', minHeight: 100 },
  slotAddIconSmall: { fontSize: 28, fontWeight: '300' },

  /* Empty state full-width add */
  slotEmpty: { borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', paddingVertical: 28, paddingHorizontal: 20 },
  slotEmptyFull: { width: '100%' },
  slotAddIcon: { fontSize: 32, fontWeight: '300', marginBottom: 6 },
  slotAddLabel: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  slotAddHint: { fontSize: 12, textAlign: 'center', lineHeight: 18 },

  /* Tracker Picker Bottom Sheet */
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, maxHeight: '70%' },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  pickerTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  pickerSub: { fontSize: 13, marginBottom: 18 },
  pickerSectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 14, marginBottom: 10 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 12 },
  pickerOptionDot: { width: 8, height: 8, borderRadius: 4 },
  pickerOptionEmoji: { fontSize: 20 },
  pickerOptionText: { flex: 1 },
  pickerOptionLabel: { fontSize: 15, fontWeight: '600', marginBottom: 1 },
  pickerOptionSub: { fontSize: 12 },
  pickerCancel: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  pickerCancelText: { fontSize: 14, fontWeight: '500' },

  /* Privacy Shield */
  privacyCard: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, borderWidth: 1 },
  privacyText: { fontSize: 12, lineHeight: 18 },

  /* Hero card */
  heroCard: { borderRadius: 16, padding: 24, marginBottom: 24, borderWidth: 1, position: 'relative', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  heroGoldLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  heroLabel: { fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 10 },
  heroAmount: { fontSize: 38, fontWeight: '700', letterSpacing: -0.5 },
  heroSub: { fontSize: 13, marginTop: 6 },

  /* Streak badge on hero card */
  streakBadge: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, gap: 4 },
  streakIcon: { fontSize: 14 },
  streakText: { fontSize: 13, fontWeight: '700' },

  budgetInline: { marginTop: 18, paddingTop: 16, borderTopWidth: 1 },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  budgetMessage: { fontSize: 13, fontWeight: '600' },
  budgetDetail: { fontSize: 12 },
  budgetTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  budgetFill: { height: '100%', borderRadius: 3 },
  budgetEditHint: { fontSize: 10, marginTop: 8, textAlign: 'right' },
  setBudgetText: { fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 4 },

  /* Metrics Row */
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  metricCard: { flex: 1, borderRadius: 12, padding: 14, borderWidth: 1, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  metricIcon: { fontSize: 22, marginBottom: 8 },
  metricLabel: { fontSize: 8, fontWeight: '600', letterSpacing: 1.5, marginBottom: 6 },
  metricValue: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  metricSub: { fontSize: 10, marginTop: 3 },

  /* Review Expenses Card */
  reviewCard: { borderRadius: 12, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  reviewPressable: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  reviewLeft: { flex: 1 },
  reviewIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  reviewEmoji: { fontSize: 22 },
  premiumBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  premiumBadgeText: { fontSize: 8, fontWeight: '700', color: '#FFF', letterSpacing: 0.5 },
  reviewTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  reviewSub: { fontSize: 12 },
  reviewBadge: { borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  reviewBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  reviewTrackerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  reviewTrackerLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginRight: 8 },
  reviewTrackerChips: { flexDirection: 'row', gap: 6 },
  reviewTrackerChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  reviewTrackerDot: { width: 6, height: 6, borderRadius: 3 },
  reviewTrackerChipText: { fontSize: 11, fontWeight: '500' },

  /* Goal Budget Card */
  goalBudgetCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: 18, marginBottom: 12, borderWidth: 1 },
  goalBudgetLeft: { flex: 1 },
  goalBudgetLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1.5, marginBottom: 4 },
  goalBudgetName: { fontSize: 15, fontWeight: '500' },
  goalBudgetRight: { alignItems: 'flex-end' },
  goalBudgetAmount: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  goalBudgetSub: { fontSize: 11, marginTop: 2 },

  /* Finance Cards */
  financeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1 },
  financeLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  financeEmoji: { fontSize: 24 },
  financeTitle: { fontSize: 15, fontWeight: '600', marginBottom: 3 },
  financeSub: { fontSize: 12 },
  financeArrow: { fontSize: 22, fontWeight: '300' },

  /* Budget Modal */
  budgetModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  budgetModalContainer: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: COLORS.border, borderBottomWidth: 0 },
  budgetModalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.surfaceHigher, alignSelf: 'center', marginBottom: 20 },
  budgetModalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 6 },
  budgetModalSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 24 },
  budgetModalInput: { backgroundColor: COLORS.surfaceHigh, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 16, fontSize: 24, fontWeight: '600', color: COLORS.text, textAlign: 'center', borderWidth: 1, borderColor: COLORS.border, marginBottom: 20 },
  budgetModalSaveBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  budgetModalSaveBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  budgetModalDeleteBtn: { paddingVertical: 14, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: `${COLORS.danger}30`, backgroundColor: `${COLORS.danger}08`, marginBottom: 8 },
  budgetModalDeleteBtnText: { fontSize: 14, fontWeight: '500', color: COLORS.danger },
  budgetModalCancelBtn: { paddingVertical: 12, alignItems: 'center' },
  budgetModalCancelText: { fontSize: 14, fontWeight: '500', color: COLORS.textSecondary },

  /* Quick Add FAB */
  fab: { position: 'absolute', right: 20, bottom: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 14, borderRadius: 28, elevation: 4, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8 },
  fabIcon: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginRight: 6 },
  fabText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14, letterSpacing: 0.3 },

  /* Overdue Subscription Popup */
  overdueOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  overdueContent: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 28, margin: 24, width: '85%', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  overdueEmoji: { fontSize: 40, marginBottom: 12 },
  overdueTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  overdueSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  overdueRemoveBtn: { backgroundColor: `${COLORS.danger}10`, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: `${COLORS.danger}25` },
  overdueRemoveText: { fontSize: 15, fontWeight: '600', color: COLORS.danger },
  overdueSkipBtn: { backgroundColor: COLORS.surfaceHigh, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  overdueSkipText: { fontSize: 14, fontWeight: '500', color: COLORS.textSecondary },

  /* EMI Celebration */
  celebrationContent: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 32, margin: 24, width: '85%', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  celebrationEmoji: { fontSize: 64, marginBottom: 16 },
  celebrationTitle: { fontSize: 28, fontWeight: '700', color: COLORS.success, textAlign: 'center', marginBottom: 8 },
  celebrationSub: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 16 },
  celebrationBadge: { backgroundColor: `${COLORS.success}15`, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 24 },
  celebrationBadgeText: { fontSize: 13, fontWeight: '700', color: COLORS.success, letterSpacing: 1 },
  celebrationBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', width: '100%' },
  celebrationBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
});
