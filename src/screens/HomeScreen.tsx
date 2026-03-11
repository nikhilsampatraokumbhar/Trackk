import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, AppState, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import { getTransactions, getGoals, computeTodaySpendFromTransactions, deleteTransaction, getTransaction } from '../services/StorageService';
import { getOverallBudget, getBudgetStatus, setBudget, deleteBudget, BudgetStatus } from '../services/BudgetService';
import { getTodayPendingCount } from '../services/TransactionSignalEngine';
import { Transaction, SavingsGoal } from '../models/types';
import TransactionCard from '../components/TransactionCard';
import AnimatedAmount from '../components/AnimatedAmount';
import { HeroCardSkeleton, TransactionListSkeleton } from '../components/SkeletonLoader';
import ActiveTrackerBanner from '../components/ActiveTrackerBanner';
import TrackerSelectionDialog from '../components/TrackerSelectionDialog';
import UndoToast from '../components/UndoToast';
import ContextMenu, { ContextMenuItem } from '../components/ContextMenu';
import { useStaggerAnimation } from '../hooks/useStaggerAnimation';
import { COLORS, formatCurrency } from '../utils/helpers';
import { saveTransaction } from '../services/StorageService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { groups } = useGroups();
  const {
    trackerState, getActiveTrackers, pendingTransaction, pendingGroupTracker,
    clearPendingTransaction, addTransactionToTracker,
    transactionVersion,
  } = useTracker();

  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [monthSpent, setMonthSpent] = useState(0);
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

  // Undo toast
  const [undoState, setUndoState] = useState<{ visible: boolean; message: string; txn: Transaction | null }>({ visible: false, message: '', txn: null });

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; transaction: Transaction | null }>({ visible: false, transaction: null });

  // Parallax
  const scrollY = useRef(new Animated.Value(0)).current;

  // Staggered animations
  const stagger = useStaggerAnimation(recentTxns.length, !loading);

  const activeTrackers = getActiveTrackers(groups);

  // Auto-open SplitEditor when a group tracker is auto-routed from notification
  useEffect(() => {
    if (pendingTransaction && pendingGroupTracker) {
      const txn = pendingTransaction;
      const tracker = pendingGroupTracker;
      clearPendingTransaction();
      nav.navigate('SplitEditor', {
        groupId: tracker.id,
        amount: txn.amount,
        description: txn.merchant
          ? `Payment at ${txn.merchant}`
          : undefined,
        merchant: txn.merchant || undefined,
      });
    }
  }, [pendingTransaction, pendingGroupTracker]);

  const loadTransactions = useCallback(async () => {
    const all = await getTransactions();
    const personalOnly = all.filter(t => !t.groupId);
    const sorted = all.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    setRecentTxns(sorted);
    setTotalSpent(personalOnly.reduce((s, t) => s + t.amount, 0));

    const now = new Date();
    const thisMonth = personalOnly.filter(t => {
      const d = new Date(t.timestamp);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const ms = thisMonth.reduce((s, t) => s + t.amount, 0);
    setMonthSpent(ms);

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

    // Load pending review count for nightly review badge
    const pendingCount = await getTodayPendingCount();
    setPendingReviewCount(pendingCount);

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

  // Swipe-to-delete with undo
  const handleSwipeDelete = async (txn: Transaction) => {
    await deleteTransaction(txn.id);
    setUndoState({ visible: true, message: `Deleted: ${txn.description}`, txn });
    await loadTransactions();
  };

  const handleUndo = async () => {
    if (undoState.txn) {
      const txn = undoState.txn;
      // Re-save the transaction
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

  // Long-press context menu
  const getContextMenuItems = (txn: Transaction): ContextMenuItem[] => [
    { label: 'View Details', icon: '📋', onPress: () => nav.navigate('TransactionDetail', { transactionId: txn.id }) },
    { label: 'Delete', icon: '🗑️', destructive: true, onPress: () => handleSwipeDelete(txn) },
  ];

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const contextualSubtext = useMemo(() => {
    const day = new Date().getDay();
    const h = new Date().getHours();
    if (budgetStatus && budgetStatus.percentage > 80) return 'Budget\'s getting tight — stay mindful';
    if (recentTxns.length === 0) return 'Start tracking your expenses';
    if (day === 0 || day === 6) return 'Weekend vibes — spend wisely';
    if (h < 12) return 'Let\'s keep spending in check today';
    if (h >= 21) return 'Wrapping up the day\'s expenses';
    return 'Your finances at a glance';
  }, [budgetStatus, recentTxns.length]);

  const hasTransactions = recentTxns.length > 0;
  const userInitial = (user?.displayName || 'U')[0].toUpperCase();

  // Parallax for hero card
  const heroScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.08, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
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
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.name}>{user?.displayName || 'User'}</Text>
            <Text style={styles.contextSub}>{contextualSubtext}</Text>
          </View>
          <TouchableOpacity style={styles.profileBtn} onPress={() => (nav as any).navigate('Profile')} activeOpacity={0.7}>
            <Text style={styles.profileInitial}>{userInitial}</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy Shield */}
        {!hasTransactions && (
          <View style={styles.privacyCard}>
            <View style={styles.privacyHeader}>
              <Text style={styles.privacyEmoji}>🛡️</Text>
              <Text style={styles.privacyTitle}>Privacy Shield</Text>
            </View>
            <Text style={styles.privacyText}>
              Trackk only reads SMS when you enable a tracker. Event-driven detection means zero battery drain. Switch off anytime.
            </Text>
          </View>
        )}

        {/* Hero card with parallax */}
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
              <Text style={styles.heroLabel}>TOTAL SPENT</Text>
              <AnimatedAmount value={totalSpent} style={styles.heroAmount} />
              <Text style={styles.heroSub}>
                {recentTxns.length > 0
                  ? `Across ${recentTxns.filter(t => !t.groupId).length} personal transactions`
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

        {/* Today's Goal Budget */}
        {activeGoal && (
          <TouchableOpacity style={styles.goalBudgetCard} onPress={() => nav.navigate('Goals')} activeOpacity={0.7}>
            <View style={styles.goalBudgetLeft}>
              <Text style={styles.goalBudgetLabel}>TODAY'S BUDGET</Text>
              <Text style={styles.goalBudgetName}>{activeGoal.name}</Text>
            </View>
            <View style={styles.goalBudgetRight}>
              <Text style={[styles.goalBudgetAmount, todaySpend > activeGoal.dailyBudget && { color: COLORS.danger }]}>
                {formatCurrency(Math.max(activeGoal.dailyBudget - todaySpend, 0))}
              </Text>
              <Text style={styles.goalBudgetSub}>{formatCurrency(todaySpend)} / {formatCurrency(activeGoal.dailyBudget)}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => nav.navigate('QuickAdd', undefined)}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: `${COLORS.primary}20` }]}>
              <Text style={styles.quickActionEmoji}>+</Text>
            </View>
            <Text style={styles.quickActionLabel}>Quick Add</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => nav.navigate('NightlyReview')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(138,120,240,0.15)' }]}>
              <Text style={styles.quickActionEmoji}>🌙</Text>
              {pendingReviewCount > 0 && (
                <View style={styles.quickActionBadge}>
                  <Text style={styles.quickActionBadgeText}>{pendingReviewCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.quickActionLabel}>Review</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => nav.navigate('Reimbursement')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: `${COLORS.reimbursementColor}15` }]}>
              <Text style={styles.quickActionEmoji}>🧾</Text>
            </View>
            <Text style={styles.quickActionLabel}>Reimburse</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => nav.navigate('Goals')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: `${COLORS.success}15` }]}>
              <Text style={styles.quickActionEmoji}>🎯</Text>
            </View>
            <Text style={styles.quickActionLabel}>Goals</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Transactions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
        </View>

        {loading ? (
          <TransactionListSkeleton count={4} />
        ) : recentTxns.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Text style={styles.emptyEmoji}>💳</Text></View>
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySubtext}>Enable a tracker, make a payment</Text>
          </View>
        ) : (
          recentTxns.map((t, index) => (
            <Animated.View key={t.id} style={stagger.getStyle(index)}>
              <TransactionCard
                transaction={t}
                showBadge
                onPress={() => nav.navigate('TransactionDetail', { transactionId: t.id })}
                onLongPress={() => setContextMenu({ visible: true, transaction: t })}
                onSwipeDelete={() => handleSwipeDelete(t)}
              />
            </Animated.View>
          ))
        )}

        <View style={{ height: 20 }} />
      </Animated.ScrollView>

      {/* Budget editing modal */}
      <Modal visible={showBudgetModal} animationType="slide" transparent onRequestClose={() => setShowBudgetModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.budgetModalOverlay}>
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
            if (tracker.type === 'group') {
              clearPendingTransaction();
              nav.navigate('SplitEditor', {
                groupId: tracker.id,
                amount: pendingTransaction.amount,
                description: pendingTransaction.merchant ? `Payment at ${pendingTransaction.merchant}` : undefined,
                merchant: pendingTransaction.merchant || undefined,
              });
            } else {
              await addTransactionToTracker(pendingTransaction, tracker.type, tracker.id);
              clearPendingTransaction();
              await loadTransactions();
            }
          }
        }}
        onIgnore={clearPendingTransaction}
      />

      {/* Undo Toast */}
      <UndoToast
        visible={undoState.visible}
        message={undoState.message}
        onUndo={handleUndo}
        onDismiss={() => setUndoState({ visible: false, message: '', txn: null })}
      />

      {/* Context Menu */}
      <ContextMenu
        visible={contextMenu.visible}
        onClose={() => setContextMenu({ visible: false, transaction: null })}
        items={contextMenu.transaction ? getContextMenuItems(contextMenu.transaction) : []}
        title={contextMenu.transaction?.description}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 32 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, marginTop: 4 },
  headerLeft: { flex: 1 },
  greeting: { fontSize: 13, color: COLORS.textSecondary, letterSpacing: 0.3 },
  name: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginTop: 2, letterSpacing: -0.5 },
  contextSub: { fontSize: 12, color: COLORS.textLight, marginTop: 4, letterSpacing: 0.2 },
  profileBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { fontSize: 17, fontWeight: '800', color: COLORS.text },

  privacyCard: { backgroundColor: COLORS.glass, borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: `${COLORS.success}20` },
  privacyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  privacyEmoji: { fontSize: 18, marginRight: 8 },
  privacyTitle: { fontSize: 14, fontWeight: '700', color: COLORS.success, letterSpacing: 0.3 },
  privacyText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },

  heroCard: { borderRadius: 24, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: COLORS.glassBorder, position: 'relative', overflow: 'hidden' },
  heroGoldLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: COLORS.primary, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  heroLabel: { fontSize: 10, color: COLORS.textSecondary, letterSpacing: 2, fontWeight: '700', marginBottom: 10 },
  heroAmount: { fontSize: 40, fontWeight: '800', color: COLORS.text, letterSpacing: -1 },
  heroSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 6 },

  budgetInline: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.glassBorder },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  budgetMessage: { fontSize: 12, fontWeight: '700' },
  budgetDetail: { fontSize: 11, color: COLORS.textSecondary },
  budgetTrack: { height: 4, backgroundColor: COLORS.glassHigh, borderRadius: 2, overflow: 'hidden' },
  budgetFill: { height: '100%', borderRadius: 2 },
  budgetEditHint: { fontSize: 10, color: COLORS.textLight, marginTop: 8, textAlign: 'right' },
  setBudgetText: { fontSize: 13, fontWeight: '600', color: COLORS.primary, textAlign: 'center', paddingVertical: 4 },

  goalBudgetCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.glass, borderRadius: 20, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: COLORS.glassBorder },
  goalBudgetLeft: { flex: 1 },
  goalBudgetLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5, marginBottom: 4 },
  goalBudgetName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  goalBudgetRight: { alignItems: 'flex-end' },
  goalBudgetAmount: { fontSize: 22, fontWeight: '800', color: COLORS.success, letterSpacing: -0.5 },
  goalBudgetSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  /* Quick Actions */
  quickActionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 16, gap: 8 },
  quickActionBtn: { flex: 1, alignItems: 'center' },
  quickActionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  quickActionEmoji: { fontSize: 20 },
  quickActionLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 0.3 },
  quickActionBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: COLORS.danger, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  quickActionBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },

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

  sectionHeader: { marginBottom: 12, marginTop: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5, textTransform: 'uppercase' },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: COLORS.glass, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.glassBorder },
  emptyEmoji: { fontSize: 28 },
  emptyText: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  emptySubtext: { fontSize: 13, color: COLORS.textLight, marginTop: 6, textAlign: 'center' },
});
