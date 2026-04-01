import React, { useCallback, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useGroups } from '../store/GroupContext';
import { usePremium } from '../store/PremiumContext';
import { useTheme } from '../store/ThemeContext';
import EmptyState from '../components/EmptyState';
import { getColorForId, formatCurrency } from '../utils/helpers';
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
  const { isPremium } = usePremium();
  const { colors, isDark } = useTheme();
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
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <FlatList
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <Text style={[styles.screenTitle, { color: colors.text }]}>Your Groups</Text>

            {/* Overall Balances Summary */}
            {(() => {
              const allStats = Object.values(groupStats);
              if (allStats.length === 0) return null;
              const totalNetOwed = allStats.reduce((s, st) => s + st.netOwed, 0);
              const totalOwedToYou = allStats.reduce((s, st) => s + Math.max(st.netOwed, 0), 0);
              const totalYouOwe = allStats.reduce((s, st) => s + Math.abs(Math.min(st.netOwed, 0)), 0);
              if (totalOwedToYou === 0 && totalYouOwe === 0) return null;
              return (
                <View style={[styles.balanceSummaryCard, {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: '#000',
                }]}>
                  <View style={styles.balanceSummaryRow}>
                    <View style={styles.balanceStat}>
                      <Text style={[styles.balanceStatLabel, { color: colors.textSecondary }]}>YOU ARE OWED</Text>
                      <Text style={[styles.balanceStatValue, { color: colors.success }]}>{formatCurrency(totalOwedToYou)}</Text>
                    </View>
                    <View style={[styles.balanceDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.balanceStat}>
                      <Text style={[styles.balanceStatLabel, { color: colors.textSecondary }]}>YOU OWE</Text>
                      <Text style={[styles.balanceStatValue, { color: colors.danger }]}>{formatCurrency(totalYouOwe)}</Text>
                    </View>
                  </View>
                  <View style={[styles.balanceNetRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.balanceNetLabel, { color: colors.textSecondary }]}>Net</Text>
                    <Text style={[styles.balanceNetValue, { color: totalNetOwed >= 0 ? colors.success : colors.danger }]}>
                      {totalNetOwed >= 0 ? `+${formatCurrency(totalNetOwed)}` : `-${formatCurrency(Math.abs(totalNetOwed))}`}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {!isPremium && (
              <TouchableOpacity
                style={[styles.premiumBanner, {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }]}
                onPress={() => nav.navigate('Pricing')}
                activeOpacity={0.8}
              >
                <View style={[styles.premiumBannerGoldLine, { backgroundColor: colors.primary }]} />
                <View style={styles.premiumBannerContent}>
                  <View style={styles.premiumBannerLeft}>
                    <View style={[styles.premiumBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.premiumBadgeText}>PRO</Text>
                    </View>
                    <View>
                      <Text style={[styles.premiumBannerTitle, { color: colors.primary }]}>Unlock Unlimited Groups</Text>
                      <Text style={[styles.premiumBannerSub, { color: colors.textSecondary }]}>Free plan: up to 3 groups</Text>
                    </View>
                  </View>
                  <Text style={[styles.premiumBannerChevron, { color: colors.primary }]}>›</Text>
                </View>
              </TouchableOpacity>
            )}
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>YOUR GROUPS</Text>
          </>
        }
        ListEmptyComponent={
          <>
            {/* Example group card to show what it looks like */}
            <View style={[styles.groupCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.4 }]} pointerEvents="none">
              <View style={styles.groupTopRow}>
                <View style={[styles.groupIcon, { backgroundColor: `${colors.groupColor}18` }]}>
                  <Text style={[styles.groupInitial, { color: colors.groupColor }]}>F</Text>
                </View>
                <View style={styles.groupTextWrap}>
                  <Text style={[styles.groupName, { color: colors.text }]}>Flatmates</Text>
                  <Text style={[styles.groupMeta, { color: colors.textSecondary }]}>3 members · 12 txns</Text>
                </View>
                <View style={styles.groupStatsRight}>
                  <Text style={[styles.groupTotal, { color: colors.text }]}>{formatCurrency(15400)}</Text>
                  <Text style={[styles.groupSettled, { color: colors.textSecondary }]}>Settled 67%</Text>
                </View>
              </View>
              <View style={styles.netRow}>
                <Text style={[styles.netLabel, { color: colors.textSecondary }]}>Net</Text>
                <Text style={[styles.netValue, { color: colors.success }]}>You are owed {formatCurrency(2300)}</Text>
              </View>
            </View>
            <EmptyState
              icon="👥"
              title="No groups yet"
              subtitle="Create a group to split expenses with friends"
              accent={colors.groupColor}
              actionLabel="Create Group"
              onAction={() => nav.navigate('CreateGroup')}
            />
          </>
        }
        data={activeGroups}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const color = getColorForId(item.id);
          const stats = groupStats[item.id];
          const netOwed = stats?.netOwed || 0;

          return (
            <TouchableOpacity
              style={[styles.groupCard, {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                shadowColor: '#000',
              }]}
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
                  <Text style={[styles.groupName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.groupMeta, { color: colors.textSecondary }]}>
                    {item.members.length} members{stats && stats.txnCount > 0 ? ` · ${stats.txnCount} txn${stats.txnCount > 1 ? 's' : ''}` : ''}
                  </Text>
                </View>
                <View style={styles.groupStatsRight}>
                  {stats && stats.total > 0 && (
                    <>
                      <Text style={[styles.groupTotal, { color: colors.text }]}>{formatCurrency(stats.total)}</Text>
                      <Text style={[styles.groupSettled, { color: colors.textSecondary }]}>Settled {stats.settledPercent}%</Text>
                    </>
                  )}
                </View>
              </View>

              {/* Net balance row */}
              {stats && stats.total > 0 && (
                <View style={styles.netRow}>
                  <Text style={[styles.netLabel, { color: colors.textSecondary }]}>Net</Text>
                  <Text style={[styles.netValue, { color: netOwed >= 0 ? colors.success : colors.danger }]}>
                    {netOwed >= 0 ? `You are owed ${formatCurrency(netOwed)}` : `You owe ${formatCurrency(Math.abs(netOwed))}`}
                  </Text>
                </View>
              )}

              {/* Budget progress (if set) */}
              {item.budget && item.budget > 0 && stats && (
                <View style={styles.budgetRow}>
                  <View style={styles.budgetLabelRow}>
                    <Text style={[styles.budgetLabel, { color: colors.textSecondary }]}>Budget</Text>
                    <Text style={[
                      styles.budgetAmount,
                      { color: colors.text },
                      stats.total > item.budget && { color: colors.danger },
                    ]}>
                      {formatCurrency(stats.total)} / {formatCurrency(item.budget)}
                    </Text>
                  </View>
                  <View style={[styles.budgetTrack, { backgroundColor: colors.surfaceHigher }]}>
                    <View
                      style={[
                        styles.budgetFill,
                        {
                          width: `${Math.min((stats.total / item.budget) * 100, 100)}%`,
                          backgroundColor: stats.total > item.budget ? colors.danger
                            : stats.total > item.budget * 0.8 ? colors.warning
                            : colors.success,
                        },
                      ]}
                    />
                  </View>
                </View>
              )}

              {/* Action row: Settle Up */}
              <View style={styles.groupActionRow}>
                <TouchableOpacity
                  style={[styles.settleUpBtn, {
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceHigh,
                  }]}
                  onPress={() => nav.navigate('GroupDetail', { groupId: item.id })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.settleUpText, { color: colors.text }]}>Settle Up</Text>
                </TouchableOpacity>
              </View>

              {/* Retention warning banner (Day 75+) */}
              {(() => {
                const retention = getGroupRetentionBanner(item.id);
                if (!retention) return null;
                return (
                  <View style={[styles.retentionBanner, {
                    backgroundColor: `${colors.warning}10`,
                    borderTopColor: `${colors.warning}20`,
                  }]}>
                    <View style={styles.retentionBannerContent}>
                      <Text style={[styles.retentionBannerText, { color: colors.warning }]}>
                        {retention.expiringCount} expense{retention.expiringCount > 1 ? 's' : ''} older than 75 days.
                        Older data is safe but locked.
                      </Text>
                      <View style={styles.retentionBannerActions}>
                        <TouchableOpacity style={[styles.retentionUpgradeBtn, {
                          backgroundColor: `${colors.primary}20`,
                          borderColor: `${colors.primary}30`,
                        }]} onPress={() => nav.navigate('Pricing')}>
                          <Text style={[styles.retentionUpgradeText, { color: colors.primary }]}>Keep with Premium</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.retentionDismissBtn} onPress={() => handleDismissBanner(item.id)}>
                          <Text style={[styles.retentionDismissText, { color: colors.textSecondary }]}>Dismiss</Text>
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
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ARCHIVED</Text>
              {archivedGroups.map(item => {
                const color = getColorForId(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.groupCard, {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: 0.6,
                      shadowColor: '#000',
                    }]}
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
                        <Text style={[styles.groupName, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.memberCount, { color: colors.textSecondary }]}>{item.members.length} members · Archived</Text>
                      </View>
                      <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
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
        style={[styles.fab, { backgroundColor: colors.primary }]}
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
        <View style={[styles.modalOverlay, {
          backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)',
        }]}>
          <View style={[styles.modalContent, {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          }]}>
            <View style={[styles.modalIconWrap, {
              backgroundColor: `${colors.warning}15`,
              borderColor: `${colors.warning}25`,
            }]}>
              <Text style={styles.modalIcon}>🗓️</Text>
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Your data is safe</Text>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              Group expenses older than 90 days will be locked
              {softAlertStatus?.daysUntilLock
                ? ` in ${softAlertStatus.daysUntilLock} day${softAlertStatus.daysUntilLock > 1 ? 's' : ''}`
                : ' soon'}
              . Your data won't be deleted — upgrade to Premium anytime to unlock full history.
            </Text>

            <TouchableOpacity
              style={[styles.modalUpgradeBtn, { backgroundColor: colors.primary }]}
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
              <Text style={[styles.modalTertiaryBtnText, { color: colors.textSecondary }]}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 100 },
  screenTitle: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* ── Premium Banner ──────────────────────────────────────── */
  premiumBanner: {
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  premiumBannerGoldLine: {
    height: 2,
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
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  premiumBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  premiumBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  premiumBannerSub: {
    fontSize: 11,
  },
  premiumBannerChevron: {
    fontSize: 22,
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 14,
  },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
  },
  emptyEmoji: { fontSize: 32 },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  groupCard: {
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
  groupInitial: { fontSize: 18, fontWeight: '700' },
  groupTextWrap: { flex: 1 },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  groupMeta: {
    fontSize: 12,
  },
  groupStatsRight: {
    alignItems: 'flex-end',
  },
  groupTotal: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  groupSettled: {
    fontSize: 11,
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
  },
  netValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  groupActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  settleUpBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  settleUpText: {
    fontSize: 13,
    fontWeight: '600',
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
  },
  budgetAmount: {
    fontSize: 12,
    fontWeight: '600',
  },
  budgetTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: 3,
  },

  memberCount: {
    fontSize: 11,
  },
  groupInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  chevron: {
    fontSize: 22,
    marginLeft: 8,
  },

  /* ── Retention Banner (per group card) ───────────────────── */
  retentionBanner: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retentionBannerContent: {
    gap: 8,
  },
  retentionBannerText: {
    fontSize: 11,
    lineHeight: 16,
  },
  retentionBannerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  retentionUpgradeBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  retentionUpgradeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  retentionDismissBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retentionDismissText: {
    fontSize: 11,
    fontWeight: '600',
  },

  /* ── Soft Alert Modal ──────────────────────────────────── */
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
  },
  modalIcon: {
    fontSize: 28,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalUpgradeBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalUpgradeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSecondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 6,
  },
  modalSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalTertiaryBtn: {
    paddingVertical: 10,
  },
  modalTertiaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  /* ── Overall Balance Summary ────────────────────────────── */
  balanceSummaryCard: {
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  balanceSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceStat: {
    flex: 1,
    alignItems: 'center',
  },
  balanceStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  balanceStatValue: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  balanceDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 12,
  },
  balanceNetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  balanceNetLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  balanceNetValue: {
    fontSize: 16,
    fontWeight: '700',
  },

  archivedSection: { marginTop: 24 },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  fabIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginRight: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
