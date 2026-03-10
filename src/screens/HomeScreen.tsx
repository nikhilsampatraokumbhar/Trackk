import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import { getTransactions, getGoals, computeTodaySpendFromTransactions } from '../services/StorageService';
import { getOverallBudget, getBudgetStatus, setBudget, deleteBudget, BudgetStatus } from '../services/BudgetService';
import { Transaction, SavingsGoal } from '../models/types';
import TransactionCard from '../components/TransactionCard';
import ActiveTrackerBanner from '../components/ActiveTrackerBanner';
import TrackerSelectionDialog from '../components/TrackerSelectionDialog';
import TrackerToggle from '../components/TrackerToggle';
import { COLORS, formatCurrency } from '../utils/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { groups } = useGroups();
  const {
    trackerState, togglePersonal, toggleReimbursement, toggleGroup,
    getActiveTrackers, pendingTransaction, clearPendingTransaction, addTransactionToTracker,
    transactionVersion,
  } = useTracker();

  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [monthSpent, setMonthSpent] = useState(0);
  const [budgetStatus, setBudgetStatusState] = useState<BudgetStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Budget editing modal
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  // Goal daily budget display
  const [activeGoal, setActiveGoal] = useState<SavingsGoal | null>(null);
  const [todaySpend, setTodaySpend] = useState(0);

  const activeTrackers = getActiveTrackers(groups);

  const loadTransactions = useCallback(async () => {
    const all = await getTransactions();
    const personalOnly = all.filter(t => !t.groupId);
    const sorted = all.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    setRecentTxns(sorted);
    setTotalSpent(personalOnly.reduce((s, t) => s + t.amount, 0));

    // Calculate this month's spend for budget
    const now = new Date();
    const thisMonth = personalOnly.filter(t => {
      const d = new Date(t.timestamp);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const ms = thisMonth.reduce((s, t) => s + t.amount, 0);
    setMonthSpent(ms);

    // Budget status
    const budget = await getOverallBudget();
    setBudgetStatusState(budget ? getBudgetStatus(budget, ms) : null);

    // Load active goal for daily budget display
    const goals = await getGoals();
    if (goals.length > 0) {
      setActiveGoal(goals[0]);
      const ts = await computeTodaySpendFromTransactions();
      setTodaySpend(ts);
    } else {
      setActiveGoal(null);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadTransactions();
  }, [loadTransactions, transactionVersion]));

  // Reload data when app returns from background (e.g. after background notification action)
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

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const hasTransactions = recentTxns.length > 0;
  const userInitial = (user?.displayName || 'U')[0].toUpperCase();

  return (
    <View style={styles.container}>
      <ActiveTrackerBanner
        activeTrackers={activeTrackers}
        onManage={() => nav.navigate('TrackerSettings')}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header with greeting and profile button */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.name}>{user?.displayName || 'User'}</Text>
          </View>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => (nav as any).navigate('Profile')}
            activeOpacity={0.7}
          >
            <Text style={styles.profileInitial}>{userInitial}</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy Shield — only shown for brand-new users (no transactions) */}
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

        {/* Hero card — total spent + budget progress merged */}
        <LinearGradient
          colors={['#1C1708', '#0E0C04', COLORS.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroGoldLine} />
          <Text style={styles.heroLabel}>TOTAL SPENT</Text>
          <Text style={styles.heroAmount}>{formatCurrency(totalSpent)}</Text>
          <Text style={styles.heroSub}>
            {recentTxns.length > 0
              ? `Across ${recentTxns.filter(t => !t.groupId).length} personal transactions`
              : 'No transactions yet'}
          </Text>

          {/* Budget progress — inline within hero (tap to edit) */}
          {budgetStatus ? (
            <TouchableOpacity onPress={openBudgetModal} activeOpacity={0.7}>
              <View style={styles.budgetInline}>
                <View style={styles.budgetRow}>
                  <Text style={[styles.budgetMessage, { color: budgetStatus.color }]}>
                    {budgetStatus.message}
                  </Text>
                  <Text style={styles.budgetDetail}>
                    {formatCurrency(Math.max(budgetStatus.budget.amount - budgetStatus.spent, 0))} left
                  </Text>
                </View>
                <View style={styles.budgetTrack}>
                  <View
                    style={[
                      styles.budgetFill,
                      {
                        width: `${Math.min(budgetStatus.percentage, 100)}%`,
                        backgroundColor: budgetStatus.color,
                      },
                    ]}
                  />
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

        {/* Today's Goal Budget — quick glance card */}
        {activeGoal && (
          <TouchableOpacity
            style={styles.goalBudgetCard}
            onPress={() => nav.navigate('Goals')}
            activeOpacity={0.7}
          >
            <View style={styles.goalBudgetLeft}>
              <Text style={styles.goalBudgetLabel}>TODAY'S BUDGET</Text>
              <Text style={styles.goalBudgetName}>{activeGoal.name}</Text>
            </View>
            <View style={styles.goalBudgetRight}>
              <Text
                style={[
                  styles.goalBudgetAmount,
                  todaySpend > activeGoal.dailyBudget && { color: COLORS.danger },
                ]}
              >
                {formatCurrency(Math.max(activeGoal.dailyBudget - todaySpend, 0))}
              </Text>
              <Text style={styles.goalBudgetSub}>
                {formatCurrency(todaySpend)} / {formatCurrency(activeGoal.dailyBudget)}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Quick Trackers */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Trackers</Text>
        </View>

        <TrackerToggle
          label="Personal Expenses"
          subtitle="Daily spending"
          isActive={trackerState.personal}
          onToggle={togglePersonal}
          color={COLORS.personalColor}
        />
        <TrackerToggle
          label="Reimbursement"
          subtitle="Office expenses"
          isActive={trackerState.reimbursement}
          onToggle={toggleReimbursement}
          color={COLORS.reimbursementColor}
        />
        {groups.slice(0, 3).map(group => (
          <TrackerToggle
            key={group.id}
            label={group.name}
            subtitle={`${group.members.length} members`}
            isActive={trackerState.activeGroupIds.includes(group.id)}
            onToggle={() => toggleGroup(group.id)}
            color={COLORS.groupColor}
          />
        ))}

        {/* Recent Transactions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
        </View>

        {recentTxns.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyEmoji}>💳</Text>
            </View>
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySubtext}>Enable a tracker, make a payment</Text>
          </View>
        ) : (
          recentTxns.map(t => (
            <TransactionCard
              key={t.id}
              transaction={t}
              showBadge
              onPress={() => nav.navigate('TransactionDetail', { transactionId: t.id })}
            />
          ))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

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
        visible={!!pendingTransaction}
        transaction={pendingTransaction}
        trackers={activeTrackers}
        onSelect={async tracker => {
          if (pendingTransaction) {
            if (tracker.type === 'group') {
              clearPendingTransaction();
              nav.navigate('SplitEditor', {
                groupId: tracker.id,
                amount: pendingTransaction.amount,
                description: pendingTransaction.merchant
                  ? `Payment at ${pendingTransaction.merchant}`
                  : undefined,
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 32 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 4,
  },
  headerLeft: { flex: 1 },
  greeting: {
    fontSize: 13,
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 2,
    letterSpacing: -0.5,
  },
  profileBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: `${COLORS.primary}20`,
    borderWidth: 1.5,
    borderColor: `${COLORS.primary}50`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.primary,
  },

  // Privacy card (only for new users)
  privacyCard: {
    backgroundColor: `${COLORS.success}10`,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${COLORS.success}30`,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  privacyEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  privacyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.success,
    letterSpacing: 0.3,
  },
  privacyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },

  heroCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    position: 'relative',
    overflow: 'hidden',
  },
  heroGoldLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  heroLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 10,
  },
  heroAmount: {
    fontSize: 38,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -1,
  },
  heroSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
  },

  // Budget inline within hero card
  budgetInline: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: `${COLORS.primary}15`,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  budgetMessage: {
    fontSize: 12,
    fontWeight: '700',
  },
  budgetDetail: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  budgetTrack: {
    height: 4,
    backgroundColor: `${COLORS.primary}15`,
    borderRadius: 2,
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: 2,
  },
  budgetEditHint: {
    fontSize: 10,
    color: COLORS.textLight,
    marginTop: 6,
    textAlign: 'right',
  },
  setBudgetText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    textAlign: 'center',
    paddingVertical: 4,
  },

  /* ── Goal Budget Card ─────────────────────────────────────────────── */
  goalBudgetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: `${COLORS.success}25`,
  },
  goalBudgetLeft: {
    flex: 1,
  },
  goalBudgetLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  goalBudgetName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  goalBudgetRight: {
    alignItems: 'flex-end',
  },
  goalBudgetAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: -0.5,
  },
  goalBudgetSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  /* ── Budget Modal ──────────────────────────────────────────────────── */
  budgetModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  budgetModalContainer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 0,
  },
  budgetModalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surfaceHigher,
    alignSelf: 'center',
    marginBottom: 20,
  },
  budgetModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  budgetModalSub: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  budgetModalInput: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
  },
  budgetModalSaveBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  budgetModalSaveBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 14,
  },
  budgetModalSaveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.background,
  },
  budgetModalDeleteBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${COLORS.danger}30`,
    backgroundColor: `${COLORS.danger}08`,
    marginBottom: 8,
  },
  budgetModalDeleteBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.danger,
  },
  budgetModalCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  budgetModalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  sectionHeader: {
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyEmoji: { fontSize: 28 },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 6,
    textAlign: 'center',
  },
});
