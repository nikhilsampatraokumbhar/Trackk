/**
 * Review Expenses Screen
 *
 * Shows ALL detected transactions from today (regardless of tracker state).
 * Groups them by active trackers. Smart detection flags EMIs/subscriptions/investments
 * so they don't accidentally get added to group expenses.
 *
 * - Personal tracker: Simple add/skip
 * - Reimbursement tracker: Simple add/skip (user attaches docs later)
 * - Group tracker: "Add" opens SplitEditor with pre-filled data
 * - Auto-detected EMIs/Subscriptions/Investments shown with warning badge
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity,
  Alert, Platform, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../store/ThemeContext';
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
  ingestTransaction,
  addToPendingReview,
} from '../services/TransactionSignalEngine';
import { classifyTransaction, processTransactionForTracking } from '../services/AutoDetectionService';
import { saveTransaction, getReimbursementTrips, createReimbursementTrip, saveReimbursementExpense } from '../services/StorageService';
import { buildDescription } from '../services/TransactionParser';
import { requestSmsPermission, checkSmsPermission, scanSmsSince } from '../services/SmsService';
import { ParsedTransaction, TrackerType, ActiveTracker } from '../models/types';
import { COLORS, formatCurrency, getColorForId } from '../utils/helpers';
import BottomSheet from '../components/BottomSheet';
import EmptyState from '../components/EmptyState';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ReviewItem {
  id: string;
  parsed: ParsedTransaction;
  source: string;
  receivedAt: number;
  reviewed: boolean;
  // Smart classification
  autoCategory: 'subscription' | 'emi' | 'investment' | null;
  autoMerchant: string | null;
  autoConfidence: number;
}

interface ReviewSection {
  title: string;
  trackerId: string;
  trackerType: TrackerType | 'auto_detected' | 'unassigned';
  color: string;
  icon: string;
  data: ReviewItem[];
}

const SOURCE_LABELS: Record<string, string> = {
  sms: 'SMS', email: 'Email', shortcut: 'Shortcut',
  deep_link: 'Deep Link', widget: 'Widget', manual: 'Manual',
};

const SOURCE_COLORS: Record<string, string> = {
  sms: '#3CB882', email: '#45A8D4', shortcut: '#E8B84A',
  deep_link: '#8A78F0', widget: '#E07888', manual: '#F09070',
};

const AUTO_CATEGORY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  emi: { label: 'EMI Detected', icon: '🏦', color: '#E8B84A' },
  subscription: { label: 'Subscription', icon: '🔄', color: '#45A8D4' },
  investment: { label: 'Investment', icon: '📈', color: '#3CB882' },
};

export default function NightlyReviewScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { groups } = useGroups();
  const { isPremium } = usePremium();
  const { trackerState, addTransactionToTracker, transactionVersion, getActiveTrackers, setDefaultTracker } = useTracker();

  const [allItems, setAllItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  // Tracker selection modal for unassigned items
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);

  // Per-item tracker selection (keyed by item id, defaults to defaultTrackerId)
  const [itemTrackerMap, setItemTrackerMap] = useState<Record<string, string>>({});

  const [refreshing, setRefreshing] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  const activeTrackers = useMemo(() => getActiveTrackers(groups), [getActiveTrackers, groups]);

  /** Load already-pending review items from AsyncStorage */
  const loadPending = useCallback(async () => {
    await cleanupOldPending();
    const pending = await getPendingReviewTransactions();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayPending = pending
      .filter(p => !p.reviewed && p.receivedAt >= todayStart.getTime());

    const todayItems: ReviewItem[] = [];
    const autoRoutedIds: string[] = [];

    for (const p of todayPending) {
      const classification = classifyTransaction(p.parsed);
      // High-confidence subscription/EMI/investment → auto-route silently
      if (classification.category && classification.confidence >= 0.7) {
        // Process and save to the appropriate section (subscriptions/EMIs/investments)
        try {
          await processTransactionForTracking(p.parsed);
        } catch {}
        autoRoutedIds.push(p.id);
        continue;
      }
      todayItems.push({
        ...p,
        autoCategory: classification.category,
        autoMerchant: classification.matchedMerchant,
        autoConfidence: classification.confidence,
      });
    }

    // Mark auto-routed items as reviewed so they don't reappear
    if (autoRoutedIds.length > 0) {
      await markAsReviewed(autoRoutedIds);
    }

    setAllItems(todayItems);
    setLoading(false);
  }, []);

  /**
   * Active refresh: scan SMS inbox (Android) for today's transactions.
   * - If SMS permission not granted, prompt for it
   * - Each parsed transaction goes through dedup → auto-detection → pending review
   * - Subscriptions/EMIs/investments are auto-routed to their sections (not shown in review)
   * - Then reload pending items to show new detections
   */
  const refreshFromSources = useCallback(async () => {
    setRefreshing(true);
    let scannedCount = 0;
    let autoRoutedCount = 0;
    let alreadyKnownCount = 0;

    // ── SMS scan (Android) ──
    if (Platform.OS === 'android') {
      const hasPermission = await checkSmsPermission();
      if (!hasPermission) {
        const granted = await requestSmsPermission();
        if (!granted) {
          setScanStatus('SMS permission required to detect expenses');
          await loadPending();
          setRefreshing(false);
          return;
        }
      }

      const smsPermitted = await checkSmsPermission();
      if (smsPermitted) {
        setScanStatus('Scanning SMS...');
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Load existing pending items to deduplicate against them
        const existingPending = await getPendingReviewTransactions();
        const existingFingerprints = new Set(
          existingPending.map(p => `${Math.round(p.parsed.amount * 100)}_${(p.parsed.merchant || '').toLowerCase().replace(/\s+/g, '')}`)
        );

        // Collect all parsed transactions first, then process sequentially
        const parsedTransactions: ParsedTransaction[] = [];
        const smsCount = await scanSmsSince(todayStart.getTime(), (parsed) => {
          parsedTransactions.push(parsed);
        });

        if (smsCount === 0 && parsedTransactions.length === 0) {
          setScanStatus('No bank SMS found today');
        }

        // Process each transaction: dedup → auto-detect → add to review
        for (const parsed of parsedTransactions) {
          // Check against existing pending items first (persistent dedup)
          const fp = `${Math.round(parsed.amount * 100)}_${(parsed.merchant || '').toLowerCase().replace(/\s+/g, '')}`;
          if (existingFingerprints.has(fp)) {
            alreadyKnownCount++;
            continue;
          }

          // Also check in-memory dedup (catches items from live listener within 60s)
          const signal = ingestTransaction(parsed, 'sms');
          if (!signal) {
            alreadyKnownCount++;
            continue;
          }

          scannedCount++;

          // Auto-detect subscriptions/EMIs/investments — route them silently
          try {
            const detection = await processTransactionForTracking(parsed);
            if (detection.matched && detection.type) {
              autoRoutedCount++;
              continue;
            }
          } catch {}

          // Regular expense — add to pending review
          await addToPendingReview(parsed, 'sms');
          existingFingerprints.add(fp); // Prevent adding same one twice within this scan
        }
      } else {
        setScanStatus('SMS permission denied');
      }
    }

    // ── iOS: app shortcuts are handled via deep links already, nothing to scan ──

    // ── Email: handled by Firebase Cloud Functions push, nothing to actively scan client-side ──
    // When email OAuth is connected, FCM pushes arrive and are already added to pending review
    // via TrackerContext's FCM handler. No client-side email scan needed.

    if (scannedCount > 0 || autoRoutedCount > 0 || alreadyKnownCount > 0) {
      const parts: string[] = [];
      if (scannedCount > 0) parts.push(`${scannedCount} new`);
      if (autoRoutedCount > 0) parts.push(`${autoRoutedCount} auto-tracked`);
      if (alreadyKnownCount > 0 && scannedCount === 0 && autoRoutedCount === 0) {
        parts.push(`${alreadyKnownCount} already in review`);
      }
      setScanStatus(`Found ${parts.join(', ')}`);
    } else if (Platform.OS === 'android') {
      setScanStatus('No new expenses found in SMS');
    } else {
      setScanStatus(null);
    }

    // Reload pending items (will pick up newly added ones)
    await loadPending();
    setRefreshing(false);
  }, [loadPending]);

  // Initial load
  useEffect(() => { loadPending(); }, [loadPending, transactionVersion]);

  // Build sections grouped by active trackers
  const sections: ReviewSection[] = useMemo(() => {
    const unreviewedItems = allItems.filter(i => !reviewedIds.has(i.id));
    if (unreviewedItems.length === 0) return [];

    // Separate auto-detected (EMI/subscription/investment) from regular
    const autoDetected = unreviewedItems.filter(
      i => i.autoCategory && i.autoConfidence >= 0.7,
    );
    const regular = unreviewedItems.filter(
      i => !i.autoCategory || i.autoConfidence < 0.7,
    );

    const result: ReviewSection[] = [];

    // Auto-detected section (EMIs, subscriptions, investments)
    if (autoDetected.length > 0) {
      result.push({
        title: 'Auto-Detected',
        trackerId: 'auto_detected',
        trackerType: 'auto_detected',
        color: '#E8B84A',
        icon: '🤖',
        data: autoDetected,
      });
    }

    if (activeTrackers.length === 0) {
      // No active trackers - show all as unassigned
      if (regular.length > 0) {
        result.push({
          title: 'Unassigned Expenses',
          trackerId: 'unassigned',
          trackerType: 'unassigned',
          color: COLORS.textSecondary,
          icon: '📋',
          data: regular,
        });
      }
    } else if (activeTrackers.length === 1) {
      // Single tracker active - all regular items go under it
      const tracker = activeTrackers[0];
      if (regular.length > 0) {
        result.push({
          title: tracker.label,
          trackerId: tracker.id,
          trackerType: tracker.type,
          color: tracker.type === 'personal' ? COLORS.personalColor
            : tracker.type === 'reimbursement' ? COLORS.reimbursementColor
            : getColorForId(tracker.id),
          icon: tracker.type === 'personal' ? '💳' : tracker.type === 'reimbursement' ? '🧾' : '👥',
          data: regular,
        });
      }
    } else {
      // Multiple trackers active — single section, each item has a per-item tracker picker
      if (regular.length > 0) {
        result.push({
          title: 'Expenses',
          trackerId: 'multi',
          trackerType: 'personal', // placeholder — actual tracker chosen per-item
          color: COLORS.primary,
          icon: '📋',
          data: regular,
        });
      }
    }

    return result;
  }, [allItems, reviewedIds, activeTrackers]);

  const unreviewedCount = allItems.filter(i => !reviewedIds.has(i.id)).length;
  const totalAmount = allItems
    .filter(i => !reviewedIds.has(i.id))
    .reduce((s, i) => s + i.parsed.amount, 0);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleAddToTracker = async (item: ReviewItem, trackerType: TrackerType, trackerId: string) => {
    if (!user) return;
    hapticMedium();

    try {
      if (trackerType === 'group') {
        // Group → open SplitEditor with pre-filled data
        const ids = [item.id];
        await markAsReviewed(ids);
        setReviewedIds(prev => new Set([...prev, ...ids]));
        nav.navigate('SplitEditor', {
          groupId: trackerId,
          amount: item.parsed.amount,
          description: buildDescription(item.parsed),
          merchant: item.parsed.merchant,
        });
      } else if (trackerType === 'reimbursement') {
        // Reimbursement → save to active trip (or create one)
        let trips = await getReimbursementTrips();
        let activeTrip = trips.find(t => t.status === 'active');
        if (!activeTrip) {
          activeTrip = await createReimbursementTrip('General');
        }
        await saveReimbursementExpense(item.parsed, activeTrip.id, user.id);
        const ids = [item.id];
        await markAsReviewed(ids);
        setReviewedIds(prev => new Set([...prev, ...ids]));
      } else {
        // Personal → save directly
        await saveTransaction(item.parsed, trackerType, user.id);
        const ids = [item.id];
        await markAsReviewed(ids);
        setReviewedIds(prev => new Set([...prev, ...ids]));
      }
    } catch {
      Alert.alert('Error', 'Failed to save transaction.');
    }
  };

  const handleSkip = async (item: ReviewItem) => {
    hapticLight();
    const ids = [item.id];
    await markAsReviewed(ids);
    setReviewedIds(prev => new Set([...prev, ...ids]));
  };

  const handleSkipAll = async () => {
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
            const ids = allItems.filter(i => !reviewedIds.has(i.id)).map(i => i.id);
            await markAsReviewed(ids);
            setReviewedIds(prev => new Set([...prev, ...ids]));
          },
        },
      ],
    );
  };

  const handleAddAllInSection = async (section: ReviewSection) => {
    if (!user) return;
    hapticMedium();

    if (section.trackerType === 'group') {
      Alert.alert('Group expenses', 'Please add group expenses individually to review the split.');
      return;
    }
    if (section.trackerType === 'auto_detected' || section.trackerType === 'unassigned') {
      Alert.alert('Choose tracker', 'Please add these expenses individually to assign them.');
      return;
    }

    const itemsToAdd = section.data.filter(i => !reviewedIds.has(i.id));
    const ids: string[] = [];

    // For reimbursement, ensure we have an active trip
    let reimbursementTripId: string | null = null;
    if (section.trackerType === 'reimbursement') {
      let trips = await getReimbursementTrips();
      let activeTrip = trips.find(t => t.status === 'active');
      if (!activeTrip) {
        activeTrip = await createReimbursementTrip('General');
      }
      reimbursementTripId = activeTrip.id;
    }

    for (const item of itemsToAdd) {
      try {
        if (section.trackerType === 'reimbursement' && reimbursementTripId) {
          await saveReimbursementExpense(item.parsed, reimbursementTripId, user.id);
        } else {
          await saveTransaction(item.parsed, section.trackerType, user.id);
        }
        ids.push(item.id);
      } catch {}
    }

    if (ids.length > 0) {
      await markAsReviewed(ids);
      setReviewedIds(prev => new Set([...prev, ...ids]));
    }
  };

  // For unassigned items or when user wants to choose tracker
  const handleChooseTracker = (item: ReviewItem) => {
    hapticLight();
    setSelectedItem(item);
    setAssignModalVisible(true);
  };

  const handleAssignFromModal = async (trackerType: TrackerType, trackerId: string) => {
    if (!selectedItem) return;
    setAssignModalVisible(false);
    await handleAddToTracker(selectedItem, trackerType, trackerId);
    setSelectedItem(null);
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // ─── Render ───────────────────────────────────────────────────────────────

  /** Get the tracker selected for a specific item (defaults to defaultTrackerId) */
  const getItemTracker = (itemId: string): ActiveTracker | null => {
    const selectedId = itemTrackerMap[itemId] || trackerState.defaultTrackerId;
    return activeTrackers.find(t => t.id === selectedId) || activeTrackers[0] || null;
  };

  /** Cycle to next tracker for a specific item */
  const cycleItemTracker = (itemId: string) => {
    if (activeTrackers.length === 0) return;
    const currentId = itemTrackerMap[itemId] || trackerState.defaultTrackerId;
    const currentIdx = activeTrackers.findIndex(t => t.id === currentId);
    // If current tracker not found, start from first; otherwise advance to next
    const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % activeTrackers.length;
    setItemTrackerMap(prev => ({ ...prev, [itemId]: activeTrackers[nextIdx].id }));
  };

  const isMultiTracker = activeTrackers.length > 1;

  const renderItem = ({ item, section }: { item: ReviewItem; section: ReviewSection }) => {
    if (reviewedIds.has(item.id)) return null;

    const isAutoDetected = section.trackerType === 'auto_detected';
    const isUnassigned = section.trackerType === 'unassigned';
    const isMulti = section.trackerId === 'multi';
    const isGroup = section.trackerType === 'group';
    const catInfo = item.autoCategory ? AUTO_CATEGORY_LABELS[item.autoCategory] : null;

    // For multi-tracker mode, resolve which tracker this item is assigned to
    const itemTracker = isMulti ? getItemTracker(item.id) : null;
    const itemTrackerColor = itemTracker
      ? (itemTracker.type === 'personal' ? COLORS.personalColor
        : itemTracker.type === 'reimbursement' ? COLORS.reimbursementColor
        : COLORS.groupColor)
      : section.color;

    return (
      <View style={styles.card}>
        {/* Header: source + time */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.sourceBadge, { backgroundColor: `${SOURCE_COLORS[item.source] || COLORS.primary}20` }]}>
              <Text style={[styles.sourceBadgeText, { color: SOURCE_COLORS[item.source] || COLORS.primary }]}>
                {SOURCE_LABELS[item.source] || item.source}
              </Text>
            </View>
            {isAutoDetected && catInfo && (
              <View style={[styles.sourceBadge, { backgroundColor: `${catInfo.color}20`, marginLeft: 6 }]}>
                <Text style={[styles.sourceBadgeText, { color: catInfo.color }]}>
                  {catInfo.icon} {catInfo.label}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.cardTime}>{formatTime(item.receivedAt)}</Text>
        </View>

        {/* Per-item tracker picker (multi-tracker mode) */}
        {isMulti && itemTracker && (
          <TouchableOpacity
            style={[styles.itemTrackerPicker, { borderColor: `${itemTrackerColor}30` }]}
            onPress={() => cycleItemTracker(item.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.itemTrackerDot, { backgroundColor: itemTrackerColor }]} />
            <Text style={[styles.itemTrackerLabel, { color: itemTrackerColor }]}>{itemTracker.label}</Text>
            <Text style={styles.itemTrackerArrow}>▾</Text>
          </TouchableOpacity>
        )}

        {/* Body: amount + merchant */}
        <View style={styles.cardBody}>
          <View style={styles.cardInfo}>
            <Text style={styles.cardAmount}>{formatCurrency(item.parsed.amount)}</Text>
            <Text style={styles.cardDesc} numberOfLines={1}>
              {item.autoMerchant || item.parsed.merchant || item.parsed.bank || 'Transaction'}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.cardActions}>
            {isAutoDetected ? (
              // Auto-detected: Skip only (already tracked in Subscriptions/EMIs/Investments)
              <>
                <View style={styles.autoTrackedBadge}>
                  <Text style={styles.autoTrackedText}>Auto-tracked</Text>
                </View>
                <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip(item)} activeOpacity={0.7}>
                  <Text style={styles.skipBtnText}>Dismiss</Text>
                </TouchableOpacity>
              </>
            ) : isUnassigned ? (
              // No tracker: Choose where to add
              <>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => handleChooseTracker(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addBtnText}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip(item)} activeOpacity={0.7}>
                  <Text style={styles.skipBtnText}>Skip</Text>
                </TouchableOpacity>
              </>
            ) : isMulti && itemTracker ? (
              // Multi-tracker: Add to selected tracker
              <>
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: `${itemTrackerColor}20` }]}
                  onPress={() => {
                    handleAddToTracker(item, itemTracker.type, itemTracker.id);
                    setDefaultTracker(itemTracker.id);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.addBtnText, { color: itemTrackerColor }]}>
                    {itemTracker.type === 'group' ? 'Split' : 'Add'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip(item)} activeOpacity={0.7}>
                  <Text style={styles.skipBtnText}>Skip</Text>
                </TouchableOpacity>
              </>
            ) : isGroup ? (
              // Group: Add opens SplitEditor
              <>
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: `${section.color}20` }]}
                  onPress={() => handleAddToTracker(item, 'group', section.trackerId)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.addBtnText, { color: section.color }]}>Split</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip(item)} activeOpacity={0.7}>
                  <Text style={styles.skipBtnText}>Skip</Text>
                </TouchableOpacity>
              </>
            ) : (
              // Personal / Reimbursement: Simple add
              <>
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: `${section.color}20` }]}
                  onPress={() => handleAddToTracker(item, section.trackerType as TrackerType, section.trackerId)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.addBtnText, { color: section.color }]}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip(item)} activeOpacity={0.7}>
                  <Text style={styles.skipBtnText}>Skip</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Auto-detected warning */}
        {!isAutoDetected && item.autoCategory && item.autoConfidence >= 0.5 && catInfo && (
          <View style={[styles.warningBanner, { borderColor: `${catInfo.color}30` }]}>
            <Text style={[styles.warningText, { color: catInfo.color }]}>
              {catInfo.icon} Looks like {catInfo.label.toLowerCase()}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: ReviewSection }) => {
    const sectionUnreviewed = section.data.filter(i => !reviewedIds.has(i.id)).length;
    if (sectionUnreviewed === 0) return null;

    const showAddAll = section.trackerType !== 'auto_detected'
      && section.trackerType !== 'unassigned'
      && section.trackerType !== 'group'
      && sectionUnreviewed > 1;

    return (
      <View style={styles.sectionHeader}>
        <View style={styles.sectionLeft}>
          <Text style={styles.sectionIcon}>{section.icon}</Text>
          <Text style={[styles.sectionTitle, { color: section.color }]}>{section.title}</Text>
          <View style={[styles.sectionCount, { backgroundColor: `${section.color}20` }]}>
            <Text style={[styles.sectionCountText, { color: section.color }]}>{sectionUnreviewed}</Text>
          </View>
        </View>
        {showAddAll && (
          <TouchableOpacity onPress={() => handleAddAllInSection(section)} activeOpacity={0.7}>
            <Text style={[styles.addAllText, { color: section.color }]}>Add All</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ─── Premium Gate ─────────────────────────────────────────────────────────
  if (!isPremium) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.premiumGate}>
          <Text style={styles.premiumEmoji}>🌙</Text>
          <Text style={styles.premiumTitle}>Review Expenses</Text>
          <Text style={styles.premiumDesc}>
            Review and categorize all your day's transactions in one go.
            {'\n\n'}This is a Premium feature.
          </Text>
          <TouchableOpacity
            style={[styles.premiumBtn, { backgroundColor: colors.primary }]}
            onPress={() => nav.navigate('Pricing')}
            activeOpacity={0.8}
          >
            <View style={styles.premiumBtnGradient}>
              <Text style={styles.premiumBtnText}>Upgrade to Premium</Text>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main Screen ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(item, i) => item.id + i}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshFromSources}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: `rgba(138,120,240,0.15)` }]}>
            <View style={styles.headerAccent} />
            <Text style={styles.headerEmoji}>🌙</Text>
            <Text style={styles.headerTitle}>Review Expenses</Text>
            <Text style={styles.headerSub}>
              {unreviewedCount > 0
                ? `${unreviewedCount} transaction${unreviewedCount > 1 ? 's' : ''} detected today`
                : 'All caught up! No transactions to review.'}
            </Text>
            {scanStatus && (
              <Text style={[styles.scanStatus, { color: colors.textSecondary }]}>{scanStatus}</Text>
            )}
            {unreviewedCount > 0 && (
              <Text style={styles.headerTotal}>{formatCurrency(totalAmount)}</Text>
            )}

            {/* Refresh button */}
            <TouchableOpacity
              style={[styles.refreshBtn, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}
              onPress={refreshFromSources}
              activeOpacity={0.7}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.refreshBtnText, { color: colors.primary }]}>
                  {Platform.OS === 'android' ? 'Scan SMS for expenses' : 'Refresh'}
                </Text>
              )}
            </TouchableOpacity>
            {activeTrackers.length > 0 && unreviewedCount > 0 && (
              <View style={styles.activeTrackerRow}>
                {activeTrackers.map(t => (
                  <View key={t.id} style={[styles.activeTrackerChip, {
                    borderColor: t.type === 'personal' ? `${COLORS.personalColor}40`
                      : t.type === 'reimbursement' ? `${COLORS.reimbursementColor}40`
                      : `${COLORS.groupColor}40`,
                  }]}>
                    <View style={[styles.trackerDot, {
                      backgroundColor: t.type === 'personal' ? COLORS.personalColor
                        : t.type === 'reimbursement' ? COLORS.reimbursementColor
                        : COLORS.groupColor,
                    }]} />
                    <Text style={styles.activeTrackerText}>{t.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              {/* Example review items to show what expenses look like here */}
              <View style={{ opacity: 0.3, marginBottom: 8 }} pointerEvents="none">
                {[
                  { desc: 'Swiggy Order', amount: 385, time: '2:30 PM', bank: 'HDFC' },
                  { desc: 'Amazon Pay', amount: 1299, time: '11:15 AM', bank: 'ICICI' },
                ].map((ex, i) => (
                  <View key={i} style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{ex.desc}</Text>
                      <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{ex.time} · {ex.bank}</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>{formatCurrency(ex.amount)}</Text>
                  </View>
                ))}
              </View>
              <EmptyState
                icon="🎉"
                title="All caught up!"
                subtitle={Platform.OS === 'android'
                  ? 'Pull down or tap "Scan SMS" to check for new expenses'
                  : 'Expenses detected via Shortcuts or email will appear here'}
                accent={COLORS.success}
              />
            </View>
          ) : null
        }
        ListFooterComponent={<View style={{ height: 80 }} />}
      />

      {/* Dismiss All */}
      {unreviewedCount > 1 && (
        <TouchableOpacity style={styles.dismissAllBtn} onPress={handleSkipAll} activeOpacity={0.8}>
          <Text style={styles.dismissAllText}>Dismiss All ({unreviewedCount})</Text>
        </TouchableOpacity>
      )}

      {/* Tracker Selection Modal (for unassigned items or multi-tracker) */}
      <BottomSheet visible={assignModalVisible} onClose={() => { setAssignModalVisible(false); setSelectedItem(null); }}>
        <Text style={styles.modalTitle}>Add to Tracker</Text>
        {selectedItem && (
          <Text style={styles.modalAmount}>
            {formatCurrency(selectedItem.parsed.amount)}
            {selectedItem.parsed.merchant ? ` at ${selectedItem.parsed.merchant}` : ''}
          </Text>
        )}

        <TouchableOpacity
          style={styles.trackerOption}
          onPress={() => handleAssignFromModal('personal', 'personal')}
          activeOpacity={0.7}
        >
          <View style={[styles.trackerDot, { backgroundColor: COLORS.personalColor }]} />
          <Text style={styles.trackerOptionText}>Personal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.trackerOption}
          onPress={() => handleAssignFromModal('reimbursement', 'reimbursement')}
          activeOpacity={0.7}
        >
          <View style={[styles.trackerDot, { backgroundColor: COLORS.reimbursementColor }]} />
          <Text style={styles.trackerOptionText}>Reimbursement</Text>
        </TouchableOpacity>

        {groups.map(g => (
          <TouchableOpacity
            key={g.id}
            style={styles.trackerOption}
            onPress={() => handleAssignFromModal('group', g.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.trackerDot, { backgroundColor: COLORS.groupColor }]} />
            <Text style={styles.trackerOptionText}>{g.name}</Text>
            {g.isTrip && <Text style={styles.tripBadge}>Trip</Text>}
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.modalCancel} onPress={() => { setAssignModalVisible(false); setSelectedItem(null); }} activeOpacity={0.7}>
          <Text style={styles.modalCancelText}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // ─── Header ────────────────────────────────────────────────────────────────
  headerCard: {
    borderRadius: 20, padding: 24, margin: 16, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(138,120,240,0.2)',
    alignItems: 'center', overflow: 'hidden',
  },
  headerAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#8A78F0' },
  headerEmoji: { fontSize: 36, marginBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  headerSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  scanStatus: { fontSize: 12, marginTop: 6, textAlign: 'center', fontStyle: 'italic' },
  refreshBtn: { marginTop: 14, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  refreshBtnText: { fontSize: 14, fontWeight: '600' },
  emptyContainer: { paddingTop: 20 },
  headerTotal: { fontSize: 28, fontWeight: '800', color: '#8A78F0', marginTop: 12 },
  activeTrackerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, justifyContent: 'center' },
  activeTrackerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, backgroundColor: COLORS.surfaceHigh,
  },
  activeTrackerText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },

  // ─── List ──────────────────────────────────────────────────────────────────
  list: { paddingBottom: 100 },

  // ─── Section Headers ───────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10,
  },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: { fontSize: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionCount: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  sectionCountText: { fontSize: 11, fontWeight: '800' },
  addAllText: { fontSize: 13, fontWeight: '700' },

  // ─── Cards ─────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: COLORS.surfaceHigh, borderRadius: 16, padding: 14,
    marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  sourceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  sourceBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  cardTime: { fontSize: 11, color: COLORS.textSecondary },
  cardBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardInfo: { flex: 1, marginRight: 12 },
  cardAmount: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  cardDesc: { fontSize: 13, color: COLORS.textSecondary },
  cardActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },

  addBtn: {
    backgroundColor: `${COLORS.primary}20`,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  skipBtn: {
    backgroundColor: COLORS.glass,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
  },
  skipBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },

  autoTrackedBadge: {
    backgroundColor: `${COLORS.success}15`, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: `${COLORS.success}25`,
  },
  autoTrackedText: { fontSize: 11, fontWeight: '700', color: COLORS.success },

  // Per-item tracker picker (multi-tracker mode)
  itemTrackerPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  itemTrackerDot: { width: 7, height: 7, borderRadius: 4 },
  itemTrackerLabel: { fontSize: 11, fontWeight: '700' },
  itemTrackerArrow: { fontSize: 10, color: COLORS.textSecondary, marginLeft: 2 },

  warningBanner: {
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, backgroundColor: 'rgba(232,184,74,0.06)',
  },
  warningText: { fontSize: 11, fontWeight: '600' },

  // ─── Dismiss All ───────────────────────────────────────────────────────────
  dismissAllBtn: {
    position: 'absolute', bottom: 20, left: 20, right: 20,
    backgroundColor: COLORS.surfaceHigher, borderRadius: 14,
    padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  dismissAllText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },

  // ─── Premium Gate ──────────────────────────────────────────────────────────
  premiumGate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  premiumEmoji: { fontSize: 60, marginBottom: 20 },
  premiumTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  premiumDesc: {
    fontSize: 14, color: COLORS.textSecondary, textAlign: 'center',
    lineHeight: 22, marginBottom: 30,
  },
  premiumBtn: { borderRadius: 30, overflow: 'hidden', width: '100%' },
  premiumBtnGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 30 },
  premiumBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // ─── Tracker Modal ─────────────────────────────────────────────────────────
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  modalAmount: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 20 },
  trackerOption: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surfaceHigh, borderRadius: 14,
    padding: 16, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border, gap: 12,
  },
  trackerDot: { width: 10, height: 10, borderRadius: 5 },
  trackerOptionText: { fontSize: 15, fontWeight: '600', color: COLORS.text, flex: 1 },
  tripBadge: {
    fontSize: 10, fontWeight: '700', color: COLORS.primary,
    backgroundColor: `${COLORS.primary}15`,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  modalCancel: { alignItems: 'center', padding: 14, marginTop: 6 },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
});
