import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, AppState, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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
import ActiveTrackerBanner from '../components/ActiveTrackerBanner';
import TrackerSelectionDialog from '../components/TrackerSelectionDialog';
import UndoToast from '../components/UndoToast';
import { checkOverdueSubscriptions, skipOverdueSubscription, removeOverdueSubscription, checkEMICompletions, OverdueSubscription, EMICompletionResult } from '../services/AutoDetectionService';
import { COLORS, formatCurrency } from '../utils/helpers';
import PressableScale from '../components/PressableScale';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { groups } = useGroups();
  const { isPremium } = usePremium();
  const {
    trackerState, getActiveTrackers, pendingTransaction, pendingGroupTracker,
    clearPendingTransaction, addTransactionToTracker,
    transactionVersion,
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

  // Parallax
  const scrollY = useRef(new Animated.Value(0)).current;

  const activeTrackers = getActiveTrackers(groups);

  // Auto-open SplitEditor when a group tracker is auto-routed from notification
  useEffect(() => {
    if (pendingTransaction && pendingGroupTracker) {
      // Capture data before clearing from queue
      const txn = pendingTransaction;
      const tracker = pendingGroupTracker;
      // Navigate first, then clear — data is passed via nav params so safe even if clear races
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

  const loadTransactions = useCallback(async () => {
    const all = await getTransactions();
    const personalOnly = all.filter(t => !t.groupId);
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ActiveTrackerBanner
        activeTrackers={activeTrackers}
        onManage={() => nav.navigate('TrackerSettings')}
      />

      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />
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
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text style={styles.name}>{user?.displayName || 'User'}</Text>
          <Text style={styles.contextSub}>{contextualSubtext}</Text>
        </View>

        {/* Hero card — Total Spent with streak on top-right */}
        {loading ? (
          <HeroCardSkeleton />
        ) : (
          <Animated.View style={{ transform: [{ scale: heroScale }] }}>
            <LinearGradient
              colors={['#1A1210', '#100C0A', COLORS.background]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroGoldLine} />

              {/* Streak badge top-right */}
              {activeGoal && activeGoal.streak > 0 && (
                <View style={styles.streakBadge}>
                  <Text style={styles.streakIcon}>🔥</Text>
                  <Text style={styles.streakText}>{activeGoal.streak}d</Text>
                </View>
              )}

              <Text style={styles.heroLabel}>TOTAL SPENT</Text>
              <AnimatedAmount value={totalSpent} style={styles.heroAmount} />
              <Text style={styles.heroSub}>
                {monthCount > 0
                  ? `${monthCount} transactions this month`
                  : 'No transactions yet'}
              </Text>

              {budgetStatus ? (
                <TouchableOpacity onPress={openBudgetModal} activeOpacity={0.7}>
                  <View style={styles.budgetInline}>
                    <View style={styles.budgetRow}>
                      <Text style={[styles.budgetMessage, { color: budgetStatus.color }]}>{budgetStatus.message}</Text>
                      <Text style={styles.budgetDetail}>{formatCurrency(Math.max(budgetStatus.budget.amount - budgetStatus.spent, 0))} left</Text>
                    </View>
                    <View style={styles.budgetTrack}>
                      <View style={[styles.budgetFill, { width: `${Math.min(budgetStatus.percentage, 100)}%`, backgroundColor: budgetStatus.color }]} />
                    </View>
                    <Text style={styles.budgetEditHint}>Tap to edit budget</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={openBudgetModal} activeOpacity={0.7}>
                  <View style={styles.budgetInline}>
                    <Text style={styles.setBudgetText}>+ Set monthly budget</Text>
                  </View>
                </TouchableOpacity>
              )}
            </LinearGradient>
          </Animated.View>
        )}

        {/* Metrics Row — Today's Jar + This Month (no streak card) */}
        <View style={styles.metricsRow}>
          {/* Today's Budget / Savings Jar */}
          <PressableScale style={styles.metricCard} onPress={() => nav.navigate('Goals')}>
            <Text style={styles.metricIcon}>🏺</Text>
            <Text style={styles.metricLabel}>TODAY'S JAR</Text>
            {activeGoal ? (
              <>
                <Text style={[styles.metricValue, todaySpend > activeGoal.dailyBudget && { color: COLORS.danger }]}>
                  {formatCurrency(savingsRemaining)}
                </Text>
                <Text style={styles.metricSub}>of {formatCurrency(activeGoal.dailyBudget)}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.metricValue, { fontSize: 14, color: COLORS.textSecondary }]}>No goal set</Text>
                <Text style={styles.metricSub}>Tap to create</Text>
              </>
            )}
          </PressableScale>

          {/* This Month */}
          <PressableScale style={styles.metricCard} onPress={() => (nav as any).navigate('Insights')}>
            <Text style={styles.metricIcon}>📊</Text>
            <Text style={styles.metricLabel}>THIS MONTH</Text>
            <Text style={styles.metricValue}>{formatCurrency(monthSpent)}</Text>
            <Text style={styles.metricSub}>{monthCount} txns</Text>
          </PressableScale>
        </View>

        {/* Review Expenses — always visible, premium-gated */}
        <PressableScale
          style={styles.reviewCard}
          onPress={() => nav.navigate('NightlyReview')}
        >
          <View style={styles.reviewLeft}>
            <View style={styles.reviewIconRow}>
              <Text style={styles.reviewEmoji}>🌙</Text>
              {!isPremium && (
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText}>PRO</Text>
                </View>
              )}
            </View>
            <Text style={styles.reviewTitle}>Review Expenses</Text>
            <Text style={styles.reviewSub}>
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

        {/* Goal Budget Card */}
        {activeGoal && (
          <PressableScale style={styles.goalBudgetCard} onPress={() => nav.navigate('Goals')}>
            <View style={styles.goalBudgetLeft}>
              <Text style={styles.goalBudgetLabel}>ACTIVE GOAL</Text>
              <Text style={styles.goalBudgetName}>{activeGoal.name}</Text>
            </View>
            <View style={styles.goalBudgetRight}>
              <Text style={[styles.goalBudgetAmount, todaySpend > activeGoal.dailyBudget && { color: COLORS.danger }]}>
                {formatCurrency(Math.max(activeGoal.dailyBudget - todaySpend, 0))}
              </Text>
              <Text style={styles.goalBudgetSub}>left today</Text>
            </View>
          </PressableScale>
        )}

        {/* Subscriptions Card */}
        <PressableScale
          style={styles.financeCard}
          onPress={() => nav.navigate('Subscriptions')}
        >
          <View style={styles.financeLeft}>
            <Text style={styles.financeEmoji}>🔄</Text>
            <View>
              <Text style={styles.financeTitle}>Subscriptions</Text>
              <Text style={styles.financeSub}>
                {subscriptions.length > 0
                  ? `${subscriptions.length} active · ${formatCurrency(subsMonthly)}/mo`
                  : 'Track your subscriptions'}
              </Text>
            </View>
          </View>
          <Text style={styles.financeArrow}>›</Text>
        </PressableScale>

        {/* Investments Card */}
        <PressableScale
          style={styles.financeCard}
          onPress={() => nav.navigate('Investments')}
        >
          <View style={styles.financeLeft}>
            <Text style={styles.financeEmoji}>📈</Text>
            <View>
              <Text style={styles.financeTitle}>Investments</Text>
              <Text style={styles.financeSub}>
                {investments.length > 0
                  ? `${investments.length} active · ${formatCurrency(investMonthly)}/mo`
                  : 'Track your investments'}
              </Text>
            </View>
          </View>
          <Text style={styles.financeArrow}>›</Text>
        </PressableScale>

        {/* EMIs Card */}
        <PressableScale
          style={styles.financeCard}
          onPress={() => nav.navigate('EMIs')}
        >
          <View style={styles.financeLeft}>
            <Text style={styles.financeEmoji}>🏦</Text>
            <View>
              <Text style={styles.financeTitle}>EMIs</Text>
              <Text style={styles.financeSub}>
                {emis.length > 0
                  ? `${emis.length} active · ${formatCurrency(emiMonthly)}/mo`
                  : 'Track your EMIs'}
              </Text>
            </View>
          </View>
          <Text style={styles.financeArrow}>›</Text>
        </PressableScale>

        {/* Privacy Shield — subtle, hidden for premium users */}
        {!loading && !isPremium && monthCount === 0 && (
          <View style={styles.privacyCard}>
            <Text style={styles.privacyText}>
              🛡️ Trackk only reads SMS when a tracker is on. Zero battery drain.
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
              placeholderTextColor={COLORS.textLight}
              keyboardType="numeric"
              autoFocus
              selectionColor={COLORS.primary}
            />
            <TouchableOpacity style={styles.budgetModalSaveBtn} onPress={handleSaveBudget} activeOpacity={0.8}>
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.budgetModalSaveBtnGradient}>
                <Text style={styles.budgetModalSaveBtnText}>{budgetStatus ? 'Update Budget' : 'Set Budget'}</Text>
              </LinearGradient>
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
        style={styles.fab}
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
            <TouchableOpacity style={styles.celebrationBtn} onPress={() => setShowEMICelebration(false)} activeOpacity={0.8}>
              <LinearGradient colors={[COLORS.success, '#2A9A6A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.celebrationBtnGrad}>
                <Text style={styles.celebrationBtnText}>Amazing!</Text>
              </LinearGradient>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 80 },

  header: { marginBottom: 24, marginTop: 8 },
  greeting: { fontSize: 14, color: COLORS.textSecondary, letterSpacing: 0.3 },
  name: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginTop: 2, letterSpacing: -0.5 },
  contextSub: { fontSize: 12, color: COLORS.textLight, marginTop: 4, letterSpacing: 0.2 },

  /* Privacy Shield — subtle single-line */
  privacyCard: { backgroundColor: COLORS.glass, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, borderWidth: 1, borderColor: `${COLORS.success}12` },
  privacyText: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },

  /* Hero card */
  heroCard: { borderRadius: 24, padding: 24, marginBottom: 24, borderWidth: 1, borderColor: COLORS.glassBorder, position: 'relative', overflow: 'hidden' },
  heroGoldLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: COLORS.primary, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  heroLabel: { fontSize: 10, color: COLORS.textSecondary, letterSpacing: 2, fontWeight: '700', marginBottom: 10 },
  heroAmount: { fontSize: 42, fontWeight: '800', color: COLORS.text, letterSpacing: -1 },
  heroSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6 },

  /* Streak badge on hero card */
  streakBadge: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(232,115,74,0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, gap: 4 },
  streakIcon: { fontSize: 14 },
  streakText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },

  budgetInline: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.glassBorder },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  budgetMessage: { fontSize: 13, fontWeight: '700' },
  budgetDetail: { fontSize: 12, color: COLORS.textSecondary },
  budgetTrack: { height: 6, backgroundColor: COLORS.glassHigh, borderRadius: 3, overflow: 'hidden' },
  budgetFill: { height: '100%', borderRadius: 3 },
  budgetEditHint: { fontSize: 10, color: COLORS.textLight, marginTop: 8, textAlign: 'right' },
  setBudgetText: { fontSize: 13, fontWeight: '600', color: COLORS.primary, textAlign: 'center', paddingVertical: 4 },

  /* Metrics Row — 2 cards now */
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  metricCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  metricIcon: { fontSize: 22, marginBottom: 8 },
  metricLabel: { fontSize: 8, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5, marginBottom: 6 },
  metricValue: { fontSize: 18, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  metricSub: { fontSize: 10, color: COLORS.textSecondary, marginTop: 3 },

  /* Review Expenses Card */
  reviewCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(138,120,240,0.15)' },
  reviewLeft: { flex: 1 },
  reviewIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  reviewEmoji: { fontSize: 22 },
  premiumBadge: { backgroundColor: COLORS.primary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  premiumBadgeText: { fontSize: 8, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  reviewTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  reviewSub: { fontSize: 12, color: COLORS.textSecondary },
  reviewBadge: { backgroundColor: COLORS.danger, borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  reviewBadgeText: { fontSize: 12, fontWeight: '800', color: '#FFF' },

  /* Goal Budget Card */
  goalBudgetCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  goalBudgetLeft: { flex: 1 },
  goalBudgetLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5, marginBottom: 4 },
  goalBudgetName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  goalBudgetRight: { alignItems: 'flex-end' },
  goalBudgetAmount: { fontSize: 22, fontWeight: '800', color: COLORS.success, letterSpacing: -0.5 },
  goalBudgetSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  /* Finance Cards (Subscriptions, Investments, EMIs) */
  financeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  financeLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  financeEmoji: { fontSize: 24 },
  financeTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  financeSub: { fontSize: 12, color: COLORS.textSecondary },
  financeArrow: { fontSize: 22, color: COLORS.textSecondary, fontWeight: '300' },

  /* Budget Modal */
  budgetModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  budgetModalContainer: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: COLORS.glassBorder, borderBottomWidth: 0 },
  budgetModalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.surfaceHigher, alignSelf: 'center', marginBottom: 20 },
  budgetModalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 6 },
  budgetModalSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 24 },
  budgetModalInput: { backgroundColor: COLORS.glass, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, fontSize: 24, fontWeight: '700', color: COLORS.text, textAlign: 'center', borderWidth: 1, borderColor: COLORS.glassBorder, marginBottom: 20 },
  budgetModalSaveBtn: { borderRadius: 30, overflow: 'hidden', marginBottom: 12 },
  budgetModalSaveBtnGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 30 },
  budgetModalSaveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  budgetModalDeleteBtn: { paddingVertical: 14, alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: `${COLORS.danger}30`, backgroundColor: `${COLORS.danger}08`, marginBottom: 8 },
  budgetModalDeleteBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.danger },
  budgetModalCancelBtn: { paddingVertical: 12, alignItems: 'center' },
  budgetModalCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },

  /* Quick Add FAB */
  fab: { position: 'absolute', right: 20, bottom: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 28, elevation: 8, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 16 },
  fabIcon: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginRight: 6 },
  fabText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, letterSpacing: 0.3 },

  /* Overdue Subscription Popup */
  overdueOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  overdueContent: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, margin: 24, width: '85%', alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder },
  overdueEmoji: { fontSize: 40, marginBottom: 12 },
  overdueTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  overdueSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  overdueRemoveBtn: { backgroundColor: `${COLORS.danger}15`, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: `${COLORS.danger}30` },
  overdueRemoveText: { fontSize: 15, fontWeight: '700', color: COLORS.danger },
  overdueSkipBtn: { backgroundColor: COLORS.glass, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder },
  overdueSkipText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },

  /* EMI Celebration */
  celebrationContent: { backgroundColor: COLORS.surface, borderRadius: 28, padding: 32, margin: 24, width: '85%', alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder },
  celebrationEmoji: { fontSize: 64, marginBottom: 16 },
  celebrationTitle: { fontSize: 28, fontWeight: '800', color: COLORS.success, textAlign: 'center', marginBottom: 8 },
  celebrationSub: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 16 },
  celebrationBadge: { backgroundColor: `${COLORS.success}20`, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 24 },
  celebrationBadgeText: { fontSize: 13, fontWeight: '800', color: COLORS.success, letterSpacing: 1 },
  celebrationBtn: { borderRadius: 30, overflow: 'hidden', width: '100%' },
  celebrationBtnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 30 },
  celebrationBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
