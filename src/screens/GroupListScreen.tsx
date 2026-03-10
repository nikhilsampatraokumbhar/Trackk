import React, { useCallback, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import { usePremium } from '../store/PremiumContext';
import TrackerToggle from '../components/TrackerToggle';
import { COLORS, getColorForId } from '../utils/helpers';
import {
  RetentionStatus,
  checkGroupRetentionStatus,
  dismissRetentionBanner,
  markSoftAlertShown,
  acceptDeletion,
} from '../services/DataRetentionService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function GroupListScreen() {
  const nav = useNavigation<Nav>();
  const { groups, loading, refreshGroups } = useGroups();
  const { trackerState, toggleGroup } = useTracker();
  const { isPremium } = usePremium();
  const [refreshing, setRefreshing] = useState(false);
  const [retentionStatuses, setRetentionStatuses] = useState<RetentionStatus[]>([]);
  const [softAlertStatus, setSoftAlertStatus] = useState<RetentionStatus | null>(null);

  useFocusEffect(useCallback(() => { refreshGroups(); }, [refreshGroups]));

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

  const handleSoftAlertResponse = async (action: 'upgrade' | 'fine' | 'later') => {
    if (!softAlertStatus) return;
    if (action === 'upgrade') {
      await markSoftAlertShown(softAlertStatus.groupId);
      setSoftAlertStatus(null);
      nav.navigate('Pricing');
    } else if (action === 'fine') {
      await markSoftAlertShown(softAlertStatus.groupId);
      await acceptDeletion(softAlertStatus.groupId);
      setSoftAlertStatus(null);
    } else {
      // "Remind me later" — just close, don't mark as shown
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyEmoji}>👥</Text>
            </View>
            <Text style={styles.emptyText}>No groups yet</Text>
            <Text style={styles.emptySubtext}>
              Create a group to split expenses with friends
            </Text>
          </View>
        }
        data={groups}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const color = getColorForId(item.id);
          const isActive = trackerState.activeGroupIds.includes(item.id);
          return (
            <View style={[styles.groupCard, isActive && { borderColor: `${COLORS.groupColor}50` }]}>
              {/* Group info row */}
              <TouchableOpacity
                style={styles.groupInfoRow}
                onPress={() => nav.navigate('GroupDetail', { groupId: item.id })}
                activeOpacity={0.7}
              >
                <View style={[styles.groupIcon, { backgroundColor: `${color}22` }]}>
                  <Text style={[styles.groupInitial, { color }]}>
                    {(item.name || 'G')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.groupTextWrap}>
                  <Text style={styles.groupName}>{item.name}</Text>
                  <View style={styles.membersRow}>
                    {item.members.slice(0, 4).map((m, i) => (
                      <View
                        key={m.userId}
                        style={[styles.memberAvatar, {
                          backgroundColor: `${getColorForId(m.userId)}30`,
                          borderColor: COLORS.surface,
                          marginLeft: i > 0 ? -8 : 0,
                          zIndex: 10 - i,
                        }]}
                      >
                        <Text style={[styles.memberInitial, { color: getColorForId(m.userId) }]}>
                          {m.displayName[0].toUpperCase()}
                        </Text>
                      </View>
                    ))}
                    {item.members.length > 4 && (
                      <View style={[styles.memberAvatar, styles.memberMore, { marginLeft: -8 }]}>
                        <Text style={styles.memberMoreText}>+{item.members.length - 4}</Text>
                      </View>
                    )}
                    <Text style={styles.memberCount}>{item.members.length} members</Text>
                  </View>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>

              {/* Retention warning banner (Day 75+) */}
              {(() => {
                const retention = getGroupRetentionBanner(item.id);
                if (!retention) return null;
                return (
                  <View style={styles.retentionBanner}>
                    <View style={styles.retentionBannerContent}>
                      <Text style={styles.retentionBannerText}>
                        {retention.expiringCount} expense{retention.expiringCount > 1 ? 's' : ''} older than 75 days.
                        Free accounts keep 90 days of history.
                      </Text>
                      <View style={styles.retentionBannerActions}>
                        <TouchableOpacity
                          style={styles.retentionUpgradeBtn}
                          onPress={() => nav.navigate('Pricing')}
                        >
                          <Text style={styles.retentionUpgradeText}>Keep with Premium</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.retentionDismissBtn}
                          onPress={() => handleDismissBanner(item.id)}
                        >
                          <Text style={styles.retentionDismissText}>Dismiss</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })()}

              {/* Tracker toggle row */}
              <View style={styles.toggleRow}>
                <TrackerToggle
                  label="Track for this group"
                  subtitle="Auto-split expenses"
                  isActive={isActive}
                  onToggle={() => toggleGroup(item.id)}
                  color={COLORS.groupColor}
                />
              </View>
            </View>
          );
        }}
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
            <Text style={styles.modalTitle}>Data cleanup ahead</Text>
            <Text style={styles.modalDesc}>
              Group expenses older than 90 days will be removed
              {softAlertStatus?.daysUntilPurge
                ? ` in ${softAlertStatus.daysUntilPurge} day${softAlertStatus.daysUntilPurge > 1 ? 's' : ''}`
                : ' soon'}
              . Upgrade to keep everything, or we'll clean up the oldest entries automatically.
            </Text>

            <TouchableOpacity
              style={styles.modalUpgradeBtn}
              onPress={() => handleSoftAlertResponse('upgrade')}
              activeOpacity={0.8}
            >
              <Text style={styles.modalUpgradeBtnText}>Upgrade to Premium</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSecondaryBtn}
              onPress={() => handleSoftAlertResponse('fine')}
              activeOpacity={0.7}
            >
              <Text style={styles.modalSecondaryBtnText}>That's fine, clean up</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalTertiaryBtn}
              onPress={() => handleSoftAlertResponse('later')}
              activeOpacity={0.7}
            >
              <Text style={styles.modalTertiaryBtnText}>Remind me later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 100 },
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
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    overflow: 'hidden',
  },
  groupInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  groupInitial: { fontSize: 20, fontWeight: '800' },
  groupTextWrap: { flex: 1 },
  groupName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  memberInitial: { fontSize: 9, fontWeight: '800' },
  memberMore: {
    backgroundColor: COLORS.surfaceHigher,
    borderColor: COLORS.border,
  },
  memberMoreText: { fontSize: 9, fontWeight: '700', color: COLORS.textSecondary },
  memberCount: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  chevron: {
    fontSize: 22,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  toggleRow: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    paddingTop: 4,
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
