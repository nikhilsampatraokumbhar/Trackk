import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTracker } from '../store/TrackerContext';
import { useGroups } from '../store/GroupContext';
import { useAuth } from '../store/AuthContext';
import { useGoals } from '../store/GoalsContext';
import { ActiveTrackerBanner } from '../components/ActiveTrackerBanner';
import { TrackerToggle } from '../components/TrackerToggle';
import { TransactionCard } from '../components/TransactionCard';
import { TrackerSelectionDialog } from '../components/TrackerSelectionDialog';
import { Transaction, RootStackParamList, TrackerType } from '../models/types';
import { subscribeToTransactions } from '../services/FirebaseService';
import { formatCurrency, COLORS } from '../utils/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Goal budget strip ─────────────────────────────────────────────────────────

function GoalBudgetStrip() {
  const { activeGoal, dailyBudget, todayRemainingBudget } = useGoals();
  if (!activeGoal) return null;

  const over = todayRemainingBudget < 0;
  const pct = Math.min(1, activeGoal.todaySpent / Math.max(1, dailyBudget));

  return (
    <View style={styles.goalStrip}>
      <View style={styles.goalStripLeft}>
        <Text style={styles.goalStripName}>{activeGoal.name}</Text>
        <Text style={[styles.goalStripStatus, { color: over ? COLORS.danger : COLORS.success }]}>
          {over
            ? `${formatCurrency(Math.abs(todayRemainingBudget))} over today`
            : `${formatCurrency(todayRemainingBudget)} left today`}
        </Text>
      </View>
      {activeGoal.streak > 0 && (
        <View style={styles.streakChip}>
          <Text style={styles.streakChipText}>{activeGoal.streak}🔥</Text>
        </View>
      )}
      <View style={styles.goalBarTrack}>
        <View
          style={[
            styles.goalBarFill,
            { width: `${Math.round(pct * 100)}%`, backgroundColor: over ? COLORS.danger : COLORS.success },
          ]}
        />
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const {
    trackerState, togglePersonal, toggleReimbursement, toggleGroup,
    getActiveTrackers, pendingTransaction, clearPendingTransaction,
    addTransactionToTracker,
  } = useTracker();
  const { groups } = useGroups();
  const { user } = useAuth();

  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);

  const activeTrackers = getActiveTrackers(groups);

  // useFocusEffect re-establishes Firestore listeners every time the tab/screen
  // is focused — this covers: (1) first mount with auth ready, (2) returning
  // from another tab, (3) app foregrounded after a background notification add.
  useFocusEffect(
    useCallback(() => {
      const unsubPersonal = subscribeToTransactions('personal', undefined, txns => {
        setRecentTransactions(prev => {
          const others = prev.filter(t => t.trackerType !== 'personal');
          return [...others, ...txns].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
        });
      });
      const unsubReimb = subscribeToTransactions('reimbursement', undefined, txns => {
        setRecentTransactions(prev => {
          const others = prev.filter(t => t.trackerType !== 'reimbursement');
          return [...others, ...txns].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
        });
      });
      return () => { unsubPersonal(); unsubReimb(); };
    }, []),
  );

  const totalSpent = recentTransactions.reduce((sum, t) => sum + t.amount, 0);
  const thisMonth = recentTransactions
    .filter(t => {
      const d = new Date(t.timestamp);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, t) => sum + t.amount, 0);

  // The dialog manages its own saving/saved phase and calls onDismiss (clearPendingTransaction)
  // after the 1.5 s success animation — so we only do the actual save here.
  const handleTrackerSelect = async (trackerType: TrackerType, trackerId: string) => {
    if (pendingTransaction) {
      await addTransactionToTracker(pendingTransaction, trackerType, trackerId);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={recentTransactions}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            {/* ── Hero ───────────────────────────────────────────────── */}
            <View style={styles.hero}>
              <Text style={styles.greeting}>
                Hey, {user?.displayName?.split(' ')[0] || 'there'}
              </Text>

              {/* NeoPOP total card */}
              <View style={styles.neoCard}>
                <Text style={styles.neoLabel}>SPENT THIS MONTH</Text>
                <Text style={styles.neoAmount}>{formatCurrency(thisMonth)}</Text>
                <View style={styles.neoDivider} />
                <View style={styles.neoFooter}>
                  <View>
                    <Text style={styles.neoFooterLabel}>ALL TIME</Text>
                    <Text style={styles.neoFooterValue}>{formatCurrency(totalSpent)}</Text>
                  </View>
                  <View style={styles.neoFooterRight}>
                    <Text style={styles.neoFooterLabel}>TRANSACTIONS</Text>
                    <Text style={styles.neoFooterValue}>{recentTransactions.length}</Text>
                  </View>
                </View>
                {/* NeoPOP 3D edges */}
                <View style={styles.neoShadowRight} />
                <View style={styles.neoShadowBottom} />
              </View>

              {/* Tracker pill */}
              <TouchableOpacity
                style={[styles.trackerPill, activeTrackers.length > 0 && styles.trackerPillActive]}
                onPress={() => navigation.navigate('TrackerSettings')}
                activeOpacity={0.75}>
                <View style={[styles.pillDot, activeTrackers.length > 0 && styles.pillDotActive]} />
                <Text style={[styles.pillText, activeTrackers.length > 0 && styles.pillTextActive]}>
                  {activeTrackers.length > 0
                    ? `${activeTrackers.length} tracker${activeTrackers.length !== 1 ? 's' : ''} live`
                    : 'Tracking off · tap to enable'}
                </Text>
                <Text style={styles.pillChevron}>›</Text>
              </TouchableOpacity>
            </View>

            {/* ── Goals strip ────────────────────────────────────────── */}
            <GoalBudgetStrip />

            {/* ── Quick tracking ──────────────────────────────────────── */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>QUICK TRACKING</Text>
            </View>
            <TrackerToggle
              label="Personal"
              subtitle="Day-to-day spending"
              isActive={trackerState.personal}
              color={COLORS.personalColor}
              onToggle={togglePersonal}
            />
            <TrackerToggle
              label="Reimbursement"
              subtitle="Office & business expenses"
              isActive={trackerState.reimbursement}
              color={COLORS.reimbursementColor}
              onToggle={toggleReimbursement}
            />
            {groups.slice(0, 3).map(group => (
              <TrackerToggle
                key={group.id}
                label={group.name}
                subtitle={`${group.members.length} members`}
                isActive={trackerState.activeGroupIds.includes(group.id)}
                color={COLORS.groupColor}
                onToggle={() => toggleGroup(group.id)}
              />
            ))}

            {/* ── Recent ─────────────────────────────────────────────── */}
            <View style={[styles.sectionHeader, { marginTop: 24 }]}>
              <Text style={styles.sectionLabel}>RECENT</Text>
              <Text style={styles.sectionCount}>{recentTransactions.length}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TransactionCard
            transaction={item}
            showTracker
            onPress={() =>
              navigation.navigate('TransactionDetail', {
                transactionId: item.id,
                trackerType: item.trackerType,
              })
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>Nothing tracked yet</Text>
            <Text style={styles.emptySubtitle}>
              Enable a tracker above — we'll auto-detect{'\n'}
              bank transactions from your SMS
            </Text>
          </View>
        }
      />

      <TrackerSelectionDialog
        visible={!!pendingTransaction}
        transaction={pendingTransaction}
        activeTrackers={activeTrackers}
        onSelect={handleTrackerSelect}
        onDismiss={clearPendingTransaction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // ── Hero ──
  hero: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  greeting: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },

  // NeoPOP card
  neoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    padding: 20,
    marginBottom: 12,
    position: 'relative',
  },
  neoLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginBottom: 6,
  },
  neoAmount: {
    fontSize: 46,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -1.5,
  },
  neoDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },
  neoFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  neoFooterLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  neoFooterValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  neoFooterRight: { alignItems: 'flex-end' },
  // 3D extrusion edges
  neoShadowRight: {
    position: 'absolute',
    right: -4,
    top: 4,
    bottom: -4,
    width: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
  },
  neoShadowBottom: {
    position: 'absolute',
    bottom: -4,
    left: 4,
    right: -4,
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
  },

  // Tracker pill
  trackerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  trackerPillActive: {
    borderColor: COLORS.success + '60',
    backgroundColor: COLORS.success + '0D',
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.textLight,
    marginRight: 10,
  },
  pillDotActive: { backgroundColor: COLORS.success },
  pillText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  pillTextActive: { color: COLORS.success },
  pillChevron: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },

  // Goal strip
  goalStrip: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  goalStripLeft: { flex: 1 },
  goalStripName: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  goalStripStatus: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },
  streakChip: {
    backgroundColor: COLORS.warning + '20',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 10,
  },
  streakChipText: { fontSize: 13, fontWeight: '800', color: COLORS.warning },
  goalBarTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: COLORS.border,
  },
  goalBarFill: { height: '100%' },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    flex: 1,
  },
  sectionCount: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textLight,
    letterSpacing: 1,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 36, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', lineHeight: 22 },
});
