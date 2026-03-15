/**
 * Nightly Review Screen (Premium Feature)
 *
 * Shows unreviewed transactions from today. User can:
 * - Assign each to a tracker (personal/group/reimbursement)
 * - Quick-categorize with one tap
 * - Batch dismiss irrelevant ones
 * - See a daily summary
 *
 * This is the "Loop 2" engagement hook.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticLight, hapticMedium } from '../utils/haptics';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { useTracker } from '../store/TrackerContext';
import { useGroups } from '../store/GroupContext';
import { usePremium } from '../store/PremiumContext';
import {
  getPendingReviewTransactions,
  markAsReviewed,
  cleanupOldPending,
} from '../services/TransactionSignalEngine';
import { saveTransaction } from '../services/StorageService';
import { buildDescription } from '../services/TransactionParser';
import { ParsedTransaction, TrackerType } from '../models/types';
import { COLORS, formatCurrency } from '../utils/helpers';
import EmptyState from '../components/EmptyState';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ReviewItem {
  id: string;
  parsed: ParsedTransaction;
  source: string;
  receivedAt: number;
  reviewed: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  sms: 'SMS',
  email: 'Email',
  shortcut: 'Shortcut',
  deep_link: 'Deep Link',
  widget: 'Widget',
  manual: 'Manual',
};

const SOURCE_COLORS: Record<string, string> = {
  sms: '#3CB882',
  email: '#45A8D4',
  shortcut: '#E8B84A',
  deep_link: '#8A78F0',
  widget: '#E07888',
  manual: '#F09070',
};

export default function NightlyReviewScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { groups } = useGroups();
  const { isPremium } = usePremium();
  const { addTransactionToTracker, transactionVersion } = useTracker();

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  const loadPending = useCallback(async () => {
    await cleanupOldPending();
    const pending = await getPendingReviewTransactions();
    // Show today's unreviewed transactions
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayItems = pending.filter(
      p => !p.reviewed && p.receivedAt >= todayStart.getTime(),
    );
    setItems(todayItems);
    setLoading(false);
  }, []);

  useEffect(() => { loadPending(); }, [loadPending, transactionVersion]);

  const totalAmount = useMemo(
    () => items.filter(i => !reviewedIds.has(i.id)).reduce((s, i) => s + i.parsed.amount, 0),
    [items, reviewedIds],
  );

  const unreviewedCount = items.filter(i => !reviewedIds.has(i.id)).length;

  const handleAssign = (item: ReviewItem) => {
    hapticLight();
    setSelectedItem(item);
    setAssignModalVisible(true);
  };

  const handleAssignToTracker = async (trackerType: TrackerType, trackerId: string) => {
    if (!selectedItem || !user) return;
    hapticMedium();

    try {
      if (trackerType === 'group') {
        // For groups, navigate to SplitEditor
        setAssignModalVisible(false);
        const ids = [selectedItem.id];
        await markAsReviewed(ids);
        setReviewedIds(prev => new Set([...prev, ...ids]));
        nav.navigate('SplitEditor', {
          groupId: trackerId,
          amount: selectedItem.parsed.amount,
          description: buildDescription(selectedItem.parsed),
          merchant: selectedItem.parsed.merchant,
        });
      } else {
        await saveTransaction(selectedItem.parsed, trackerType, user.id);
        const ids = [selectedItem.id];
        await markAsReviewed(ids);
        setReviewedIds(prev => new Set([...prev, ...ids]));
        setAssignModalVisible(false);
      }
    } catch {
      Alert.alert('Error', 'Failed to save transaction.');
    }
  };

  const handleDismiss = async (item: ReviewItem) => {
    hapticLight();
    const ids = [item.id];
    await markAsReviewed(ids);
    setReviewedIds(prev => new Set([...prev, ...ids]));
  };

  const handleDismissAll = async () => {
    hapticLight();
    Alert.alert(
      'Dismiss All',
      `Dismiss all ${unreviewedCount} unreviewed transactions?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          style: 'destructive',
          onPress: async () => {
            const ids = items.filter(i => !reviewedIds.has(i.id)).map(i => i.id);
            await markAsReviewed(ids);
            setReviewedIds(prev => new Set([...prev, ...ids]));
          },
        },
      ],
    );
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderItem = ({ item }: { item: ReviewItem }) => {
    const isReviewed = reviewedIds.has(item.id);
    if (isReviewed) return null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.sourceBadge, { backgroundColor: `${SOURCE_COLORS[item.source] || COLORS.primary}20` }]}>
            <Text style={[styles.sourceBadgeText, { color: SOURCE_COLORS[item.source] || COLORS.primary }]}>
              {SOURCE_LABELS[item.source] || item.source}
            </Text>
          </View>
          <Text style={styles.cardTime}>{formatTime(item.receivedAt)}</Text>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardInfo}>
            <Text style={styles.cardAmount}>{formatCurrency(item.parsed.amount)}</Text>
            <Text style={styles.cardDesc} numberOfLines={1}>
              {item.parsed.merchant || item.parsed.bank || 'Transaction'}
            </Text>
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.assignBtn}
              onPress={() => handleAssign(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.assignBtnText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={() => handleDismiss(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.dismissBtnText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (!isPremium) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.premiumGate}>
          <Text style={styles.premiumEmoji}>🌙</Text>
          <Text style={styles.premiumTitle}>Nightly Review</Text>
          <Text style={styles.premiumDesc}>
            Review and categorize all your day's transactions in one go.
            {'\n\n'}This is a Premium feature.
          </Text>
          <TouchableOpacity
            style={styles.premiumBtn}
            onPress={() => nav.navigate('Pricing')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.premiumBtnGradient}
            >
              <Text style={styles.premiumBtnText}>Upgrade to Premium</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header Summary */}
      <LinearGradient
        colors={['#1A0E1E', '#0E0C14', COLORS.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerCard}
      >
        <View style={styles.headerAccent} />
        <Text style={styles.headerEmoji}>🌙</Text>
        <Text style={styles.headerTitle}>Nightly Review</Text>
        <Text style={styles.headerSub}>
          {unreviewedCount > 0
            ? `You made ${unreviewedCount} payment${unreviewedCount > 1 ? 's' : ''} today`
            : 'All caught up! No transactions to review.'}
        </Text>
        {unreviewedCount > 0 && (
          <Text style={styles.headerTotal}>{formatCurrency(totalAmount)}</Text>
        )}
      </LinearGradient>

      {/* Transaction List */}
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="🎉"
              title="All caught up!"
              subtitle="Transactions detected via SMS, email, or Shortcuts will appear here"
              accent={COLORS.success}
            />
          ) : null
        }
      />

      {/* Dismiss All Button */}
      {unreviewedCount > 1 && (
        <TouchableOpacity
          style={styles.dismissAllBtn}
          onPress={handleDismissAll}
          activeOpacity={0.8}
        >
          <Text style={styles.dismissAllText}>Dismiss All ({unreviewedCount})</Text>
        </TouchableOpacity>
      )}

      {/* Assign to Tracker Modal */}
      <Modal
        visible={assignModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setAssignModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add to Tracker</Text>
            {selectedItem && (
              <Text style={styles.modalAmount}>
                {formatCurrency(selectedItem.parsed.amount)}
                {selectedItem.parsed.merchant ? ` at ${selectedItem.parsed.merchant}` : ''}
              </Text>
            )}

            <TouchableOpacity
              style={styles.trackerOption}
              onPress={() => handleAssignToTracker('personal', 'personal')}
              activeOpacity={0.7}
            >
              <View style={[styles.trackerDot, { backgroundColor: COLORS.personalColor }]} />
              <Text style={styles.trackerOptionText}>Personal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.trackerOption}
              onPress={() => handleAssignToTracker('reimbursement', 'reimbursement')}
              activeOpacity={0.7}
            >
              <View style={[styles.trackerDot, { backgroundColor: COLORS.reimbursementColor }]} />
              <Text style={styles.trackerOptionText}>Reimbursement</Text>
            </TouchableOpacity>

            {groups.map(g => (
              <TouchableOpacity
                key={g.id}
                style={styles.trackerOption}
                onPress={() => handleAssignToTracker('group', g.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.trackerDot, { backgroundColor: COLORS.groupColor }]} />
                <Text style={styles.trackerOptionText}>{g.name}</Text>
                {g.isTrip && <Text style={styles.tripBadge}>Trip</Text>}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setAssignModalVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  /* Header */
  headerCard: {
    borderRadius: 20,
    padding: 24,
    margin: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(138,120,240,0.2)',
    alignItems: 'center',
    overflow: 'hidden',
  },
  headerAccent: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 2,
    backgroundColor: '#8A78F0',
  },
  headerEmoji: { fontSize: 36, marginBottom: 8 },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },
  headerSub: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  headerTotal: {
    fontSize: 28,
    fontWeight: '800',
    color: '#8A78F0',
    marginTop: 12,
  },

  /* List */
  list: { padding: 16, paddingTop: 8, paddingBottom: 100 },

  /* Card */
  card: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardInfo: { flex: 1, marginRight: 12 },
  cardAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  assignBtn: {
    backgroundColor: `${COLORS.primary}20`,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  assignBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  dismissBtn: {
    backgroundColor: COLORS.glass,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  dismissBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  /* Empty */
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 40,
  },

  /* Dismiss All */
  dismissAllBtn: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: COLORS.surfaceHigher,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dismissAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  /* Premium Gate */
  premiumGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  premiumEmoji: { fontSize: 60, marginBottom: 20 },
  premiumTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
  },
  premiumDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  premiumBtn: {
    borderRadius: 30,
    overflow: 'hidden',
    width: '100%',
  },
  premiumBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 30,
  },
  premiumBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Assign Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#131318',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  modalAmount: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  trackerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  trackerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  trackerOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  tripBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    backgroundColor: `${COLORS.primary}15`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modalCancel: {
    alignItems: 'center',
    padding: 14,
    marginTop: 6,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});
