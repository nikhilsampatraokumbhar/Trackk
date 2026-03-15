import React, { useCallback, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import { usePremium } from '../store/PremiumContext';
import TrackerToggle from '../components/TrackerToggle';
import EmptyState from '../components/EmptyState';
import { COLORS, getColorForId, formatCurrency } from '../utils/helpers';
import {
  RetentionStatus,
  checkGroupRetentionStatus,
  dismissRetentionBanner,
  markSoftAlertShown,
} from '../services/DataRetentionService';
import { archiveGroup, getGroupTransactions } from '../services/StorageService';
import { calculateDebts, getUserDebtSummary } from '../services/DebtCalculator';
import { useAuth } from '../store/AuthContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface GroupStats {
  total: number;
  settledPercent: number;
  netOwed: number;   // positive = you are owed, negative = you owe
  txnCount: number;
}

export default function GroupListScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { groups, loading, refreshGroups } = useGroups();
  const { trackerState, toggleGroup } = useTracker();
  const { isPremium } = usePremium();
  const [refreshing, setRefreshing] = useState(false);
  const [retentionStatuses, setRetentionStatuses] = useState<RetentionStatus[]>([]);
  const [softAlertStatus, setSoftAlertStatus] = useState<RetentionStatus | null>(null);
  const [groupStats, setGroupStats] = useState<Record<string, GroupStats>>({});

  useFocusEffect(useCallback(() => { refreshGroups(); }, [refreshGroups]));

  // Load stats (total, settled %, net balance) for each group
  useEffect(() => {
    if (groups.length === 0 || !user) return;
    (async () => {
      const stats: Record<string, GroupStats> = {};
      for (const g of groups) {
        try {
          const txns = await getGroupTransactions(g.id);
          const total = txns.reduce((s, t) => s + t.amount, 0);
          const totalSplits = txns.reduce((s, t) => s + t.splits.length, 0);
          const settledSplits = txns.reduce((s, t) => s + t.splits.filter(sp => sp.settled).length, 0);
          const settledPercent = totalSplits > 0 ? Math.round((settledSplits / totalSplits) * 100) : 0;
          const debts = calculateDebts(txns);
          const { totalOwed, totalOwing } = getUserDebtSummary(debts, user.id);
          stats[g.id] = { total, settledPercent, netOwed: totalOwed - totalOwing, txnCount: txns.length };
        } catch {
          stats[g.id] = { total: 0, settledPercent: 0, netOwed: 0, txnCount: 0 };
        }
      }
      setGroupStats(stats);
    })();
  }, [groups, user]);

  // Check retention status for all groups (free users only)
  useEffect(() => {
    if (isPremium || groups.length === 0) {
      setRetentionStatuses([]);
      return;
    }
    (async () => {
      const statuses: RetentionStatus[] = [];
      for (const g of groups) {
        const status = await checkGroupRetentionStatus(g.id);
        if (status) statuses.push(status);
      }
      setRetentionStatuses(statuses);

      // Find the first group needing a soft alert
      const alertNeeded = statuses.find(s => s.showSoftAlert);
      if (alertNeeded) setSoftAlertStatus(alertNeeded);
    })();
  }, [groups, isPremium]);

  const handleDismissBanner = async (groupId: string) => {
    await dismissRetentionBanner(groupId);
    setRetentionStatuses(prev => prev.map(s =>
      s.groupId === groupId ? { ...s, showBanner: false } : s
    ));
  };

  const handleSoftAlertResponse = async (action: 'upgrade' | 'later') => {
    if (!softAlertStatus) return;
    if (action === 'upgrade') {
      await markSoftAlertShown(softAlertStatus.groupId);
      setSoftAlertStatus(null);
      nav.navigate('Pricing');
    } else {
      await markSoftAlertShown(softAlertStatus.groupId);
      setSoftAlertStatus(null);
    }
  };

  const getGroupRetentionBanner = (groupId: string) => {
    const status = retentionStatuses.find(s => s.groupId === groupId && s.showBanner);
    return status || null;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshGroups();
    setRefreshing(false);
  };

  const handleArchiveGroup = (groupId: string, groupName: string) => {
    if (!isPremium) {
      Alert.alert(
        'Premium Feature',
        'Group archiving is a Premium feature. Upgrade to keep your groups organized!',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'View Plans', onPress: () => nav.navigate('Pricing') },
        ],
      );
      return;
    }
    Alert.alert(
      'Archive Group',
      `Archive "${groupName}"? It will be moved to the archived section.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            await archiveGroup(groupId);
            await refreshGroups();
          },
        },
      ],
    );
  };

  const activeGroups = groups.filter(g => !g.archived);
  const archivedGroups = groups.filter(g => g.archived);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <Text style={styles.screenTitle}>Your Groups</Text>
            {!isPremium && (
              <TouchableOpacity
                style={styles.premiumBanner}
                onPress={() => nav.navigate('Pricing')}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#1C1708', '#12100A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.premiumBannerGradient}
                >
                  <View style={styles.premiumBannerGoldLine} />
                  <View style={styles.premiumBannerContent}>
                    <View style={styles.premiumBannerLeft}>
                      <View style={styles.premiumBadge}>
                        <Text style={styles.premiumBadgeText}>PRO</Text>
                      </View>
                      <View>
                        <Text style={styles.premiumBannerTitle}>Unlock Unlimited Groups</Text>
                        <Text style={styles.premiumBannerSub}>Free plan: up to 3 groups</Text>
                      </View>
                    </View>
                    <Text style={styles.premiumBannerChevron}>›</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}
            <Text style={styles.sectionTitle}>YOUR GROUPS</Text>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="👥"
            title="No groups yet"
            subtitle="Create a group to split expenses with friends"
            accent={COLORS.groupColor}
          />
        }
        data={activeGroups}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const color = getColorForId(item.id);
          const isActive = trackerState.activeGroupIds.includes(item.id);
          const stats = groupStats[item.id];
          const netOwed = stats?.netOwed || 0;

          return (
            <TouchableOpacity
              style={[styles.groupCard, isActive && { borderColor: `${COLORS.groupColor}40` }]}
              onPress={() => nav.navigate('GroupDetail', { groupId: item.id })}
              onLongPress={() => handleArchiveGroup(item.id, item.name)}
              delayLongPress={500}
              activeOpacity={0.7}
            >
              {/* Top row: icon + name/meta + total/settled */}
              <View style={styles.groupTopRow}>
                <View style={[styles.groupIcon, { backgroundColor: `${color}18` }]}>
                  <Text style={[styles.groupInitial, { color }]}>
                    {(item.name || 'G')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.groupTextWrap}>
                  <Text style={styles.groupName}>{item.name}</Text>
                  <Text style={styles.groupMeta}>
                    {item.members.length} members{stats && stats.txnCount > 0 ? ` · ${stats.txnCount} txn${stats.txnCount > 1 ? 's' : ''}` : ''}
                  </Text>
                </View>
                <View style={styles.groupStatsRight}>
                  {stats && stats.total > 0 && (
                    <>
                      <Text style={styles.groupTotal}>{formatCurrency(stats.total)}</Text>
                      <Text style={styles.groupSettled}>Settled {stats.settledPercent}%</Text>
                    </>
                  )}
                </View>
              </View>

              {/* Net balance row */}
              {stats && stats.total > 0 && (
                <View style={styles.netRow}>
                  <Text style={styles.netLabel}>Net</Text>
                  <Text style={[styles.netValue, { color: netOwed >= 0 ? COLORS.success : COLORS.danger }]}>
                    {netOwed >= 0 ? `You are owed ${formatCurrency(netOwed)}` : `You owe ${formatCurrency(Math.abs(netOwed))}`}
                  </Text>
                </View>
              )}

              {/* Budget progress (if set) */}
              {item.budget && item.budget > 0 && stats && (
                <View style={styles.budgetRow}>
                  <View style={styles.budgetLabelRow}>
                    <Text style={styles.budgetLabel}>Budget</Text>
                    <Text style={[
                      styles.budgetAmount,
                      stats.total > item.budget && { color: COLORS.danger },
                    ]}>
                      {formatCurrency(stats.total)} / {formatCurrency(item.budget)}
                    </Text>
                  </View>
                  <View style={styles.budgetTrack}>
                    <View
                      style={[
                        styles.budgetFill,
                        {
                          width: `${Math.min((stats.total / item.budget) * 100, 100)}%`,
                          backgroundColor: stats.total > item.budget ? COLORS.danger
                            : stats.total > item.budget * 0.8 ? COLORS.warning
                            : COLORS.success,
                        },
                      ]}
                    />
                  </View>
                </View>
              )}

              {/* Action row: Settle Up + Tracker toggle */}
              <View style={styles.groupActionRow}>
                <TouchableOpacity
                  style={styles.settleUpBtn}
                  onPress={() => nav.navigate('GroupDetail', { groupId: item.id })}
                  activeOpacity={0.7}
                >
                  <Text style={styles.settleUpText}>Settle Up</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.trackBtn, isActive && styles.trackBtnActive]}
                  onPress={() => toggleGroup(item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.trackBtnText, isActive && styles.trackBtnTextActive]}>
                    {isActive ? 'Tracking' : 'Track'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Retention warning banner (Day 75+) */}
              {(() => {
                const retention = getGroupRetentionBanner(item.id);
                if (!retention) return null;
                return (
                  <View style={styles.retentionBanner}>
                    <View style={styles.retentionBannerContent}>
                      <Text style={styles.retentionBannerText}>
                        {retention.expiringCount} expense{retention.expiringCount > 1 ? 's' : ''} older than 75 days.
                        Older data is safe but locked.
                      </Text>
                      <View style={styles.retentionBannerActions}>
                        <TouchableOpacity style={styles.retentionUpgradeBtn} onPress={() => nav.navigate('Pricing')}>
                          <Text style={styles.retentionUpgradeText}>Keep with Premium</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.retentionDismissBtn} onPress={() => handleDismissBanner(item.id)}>
                          <Text style={styles.retentionDismissText}>Dismiss</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          archivedGroups.length > 0 ? (
            <View style={styles.archivedSection}>
              <Text style={styles.sectionTitle}>ARCHIVED</Text>
              {archivedGroups.map(item => {
                const color = getColorForId(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.groupCard, { opacity: 0.6 }]}
                    onPress={() => nav.navigate('GroupDetail', { groupId: item.id })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.groupInfoRow}>
                      <View style={[styles.groupIcon, { backgroundColor: `${color}22` }]}>
                        <Text style={[styles.groupInitial, { color }]}>
                          {(item.name || 'G')[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.groupTextWrap}>
                        <Text style={styles.groupName}>{item.name}</Text>
                        <Text style={styles.memberCount}>{item.members.length} members · Archived</Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => nav.navigate('CreateGroup')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>New Group</Text>
      </TouchableOpacity>

      {/* Soft Alert Modal (Day 85 — shown once per batch) */}
      <Modal
        visible={!!softAlertStatus}
        transparent
        animationType="fade"
        onRequestClose={() => handleSoftAlertResponse('later')}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconWrap}>
              <Text style={styles.modalIcon}>🗓️</Text>
            </View>
            <Text style={styles.modalTitle}>Your data is safe</Text>
            <Text style={styles.modalDesc}>
              Group expenses older than 90 days will be locked
              {softAlertStatus?.daysUntilLock
                ? ` in ${softAlertStatus.daysUntilLock} day${softAlertStatus.daysUntilLock > 1 ? 's' : ''}`
                : ' soon'}
              . Your data won't be deleted — upgrade to Premium anytime to unlock full history.
            </Text>

            <TouchableOpacity
              style={styles.modalUpgradeBtn}
              onPress={() => handleSoftAlertResponse('upgrade')}
              activeOpacity={0.8}
            >
              <Text style={styles.modalUpgradeBtnText}>Upgrade to Premium</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalTertiaryBtn}
              onPress={() => handleSoftAlertResponse('later')}
              activeOpacity={0.7}
            >
              <Text style={styles.modalTertiaryBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 100 },
  screenTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  /* ── Premium Banner ──────────────────────────────────────── */
  premiumBanner: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  premiumBannerGradient: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${COLORS.primary}20`,
    overflow: 'hidden',
  },
  premiumBannerGoldLine: {
    height: 2,
    backgroundColor: COLORS.primary,
  },
  premiumBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  premiumBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  premiumBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  premiumBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0A0A0F',
    letterSpacing: 1,
  },
  premiumBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 2,
  },
  premiumBannerSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  premiumBannerChevron: {
    fontSize: 22,
    color: COLORS.primary,
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 14,
  },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyEmoji: { fontSize: 32 },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  emptySubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  groupCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 16,
  },
  groupTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  groupInitial: { fontSize: 18, fontWeight: '800' },
  groupTextWrap: { flex: 1 },
  groupName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  groupMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  groupStatsRight: {
    alignItems: 'flex-end',
  },
  groupTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 2,
  },
  groupSettled: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  netRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 14,
    gap: 8,
  },
  netLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  netValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  groupActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  settleUpBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.surfaceHigh,
  },
  settleUpText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },

  /* ── Budget Progress ─────────────────────────────────────── */
  budgetRow: {
    marginBottom: 14,
  },
  budgetLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  budgetLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  budgetAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  budgetTrack: {
    height: 5,
    backgroundColor: COLORS.surfaceHigher,
    borderRadius: 3,
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: 3,
  },

  trackBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  trackBtnActive: {
    borderColor: `${COLORS.groupColor}50`,
    backgroundColor: `${COLORS.groupColor}15`,
  },
  trackBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  trackBtnTextActive: {
    color: COLORS.groupColor,
  },
  memberCount: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  groupInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  chevron: {
    fontSize: 22,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },

  /* ── Retention Banner (per group card) ───────────────────── */
  retentionBanner: {
    backgroundColor: `${COLORS.warning}10`,
    borderTopWidth: 1,
    borderTopColor: `${COLORS.warning}20`,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retentionBannerContent: {
    gap: 8,
  },
  retentionBannerText: {
    fontSize: 11,
    color: COLORS.warning,
    lineHeight: 16,
  },
  retentionBannerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  retentionUpgradeBtn: {
    backgroundColor: `${COLORS.primary}20`,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  retentionUpgradeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  retentionDismissBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retentionDismissText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  /* ── Soft Alert Modal ──────────────────────────────────── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#131318',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: `${COLORS.warning}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${COLORS.warning}25`,
  },
  modalIcon: {
    fontSize: 28,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalUpgradeBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalUpgradeBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0A0A0F',
  },
  modalSecondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHigh,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 6,
  },
  modalSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalTertiaryBtn: {
    paddingVertical: 10,
  },
  modalTertiaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  archivedSection: { marginTop: 24 },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 28,
    elevation: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  fabIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginRight: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
