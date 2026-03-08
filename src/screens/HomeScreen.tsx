import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import { getTransactions } from '../services/StorageService';
import { Transaction } from '../models/types';
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
  } = useTracker();

  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const activeTrackers = getActiveTrackers(groups);

  const loadTransactions = useCallback(async () => {
    const all = await getTransactions();
    const sorted = all.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    setRecentTxns(sorted);
    setTotalSpent(all.reduce((s, t) => s + t.amount, 0));
  }, []);

  useFocusEffect(useCallback(() => {
    loadTransactions();
  }, [loadTransactions]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
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

        {/* Privacy Shield Card */}
        {!hasTransactions ? (
          <View style={styles.privacyCard}>
            <View style={styles.privacyHeader}>
              <Text style={styles.privacyEmoji}>🛡️</Text>
              <Text style={styles.privacyTitle}>Privacy Shield</Text>
            </View>
            <Text style={styles.privacyText}>
              Trackk only reads SMS when you enable a tracker. Event-driven detection means zero battery drain. Switch off anytime.
            </Text>
          </View>
        ) : (
          <View style={styles.privacyCardMini}>
            <Text style={styles.privacyEmojiMini}>🛡️</Text>
            <Text style={styles.privacyTextMini}>
              Low battery usage. Event-driven SMS detection. Switch off anytime.
            </Text>
          </View>
        )}

        {/* Hero total card */}
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
              ? `Across ${recentTxns.length} recent transactions`
              : 'No transactions yet'}
          </Text>
        </LinearGradient>

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

      {/* Tracker selection dialog */}
      <TrackerSelectionDialog
        visible={!!pendingTransaction}
        transaction={pendingTransaction}
        trackers={activeTrackers}
        onSelect={async tracker => {
          if (pendingTransaction) {
            await addTransactionToTracker(pendingTransaction, tracker.type, tracker.id);
            clearPendingTransaction();
            await loadTransactions();
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

  // Privacy card (full - shown when no transactions)
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

  // Privacy card (mini - shown when transactions exist)
  privacyCardMini: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.success}08`,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${COLORS.success}18`,
  },
  privacyEmojiMini: {
    fontSize: 14,
    marginRight: 8,
  },
  privacyTextMini: {
    fontSize: 11,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 16,
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
