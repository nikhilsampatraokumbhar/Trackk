import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Linking, Alert,
  TextInput, AppState, AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import { useAuth } from '../store/AuthContext';
import { getGroup as getGroupLocal } from '../services/StorageService';
import {
  addSettlementCloud, getSettlementsCloud,
  onSettlementsChanged, onGroupChanged, getGroupCloud,
} from '../services/SyncService';
import { Group, GroupTransaction, Split, Settlement, Debt } from '../models/types';
import { simplifyDebts } from '../services/DebtCalculator';
import TrackerToggle from '../components/TrackerToggle';
import EmptyState from '../components/EmptyState';
import { COLORS, formatCurrency, formatDate, getColorForId } from '../utils/helpers';
import BottomSheet from '../components/BottomSheet';

type Route = RouteProp<RootStackParamList, 'GroupDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

interface SettleTarget {
  debt: Debt;
}

interface EditingTxn {
  txn: GroupTransaction;
  amount: string;
  description: string;
  members: Array<{ userId: string; displayName: string; included: boolean }>;
}

// Timeline item: either a group expense or a settlement record
type TimelineItem =
  | { kind: 'expense'; data: GroupTransaction }
  | { kind: 'settlement'; data: Settlement };

function groupByMonth(items: TimelineItem[]): Array<{ title: string; data: TimelineItem[] }> {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const map = new Map<string, TimelineItem[]>();

  for (const item of items) {
    const ts = item.kind === 'expense' ? item.data.timestamp : item.data.timestamp;
    const d = new Date(ts);
    const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

export default function GroupDetailScreen() {
  const route = useRoute<Route>();
  const nav = useNavigation<Nav>();
  const { groupId } = route.params;
  const { user } = useAuth();
  const {
    activeGroupTransactions, activeGroupDebts, loadGroupTransactions,
    settleSplit, unsettleSplit, groups,
    deleteGroupTransaction, updateGroupTransaction,
  } = useGroups();
  const { trackerState, toggleGroup } = useTracker();

  const [group, setGroup] = useState<Group | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  // Settle flow
  const [settleListVisible, setSettleListVisible] = useState(false);
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [pendingUPISettle, setPendingUPISettle] = useState<{ debt: Debt; amount: number } | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  // Edit expense modal
  const [editingTxn, setEditingTxn] = useState<EditingTxn | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const { isAuthenticated } = useAuth();

  const load = useCallback(async () => {
    let g = await getGroupLocal(groupId);
    if (!g && isAuthenticated) {
      try { g = await getGroupCloud(groupId); } catch {}
    }
    setGroup(g);
    await loadGroupTransactions(groupId);
    if (isAuthenticated) {
      try { const s = await getSettlementsCloud(groupId); setSettlements(s); } catch {}
    } else {
      const { getSettlements } = require('../services/StorageService');
      const s = await getSettlements(groupId);
      setSettlements(s);
    }
  }, [groupId, loadGroupTransactions, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const unsub = onSettlementsChanged(groupId, (s) => setSettlements(s));
    return () => unsub();
  }, [groupId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const unsub = onGroupChanged(groupId, (g) => { if (g) setGroup(g); });
    return () => unsub();
  }, [groupId, isAuthenticated]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && pendingUPISettle) setConfirmModalVisible(true);
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [pendingUPISettle]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!group) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  const isTracking = trackerState.activeGroupIds.includes(groupId);
  const groupColor = getColorForId(group.id);
  const userId = user?.id || '';
  const simplifiedDebts = simplifyDebts(activeGroupDebts);
  const userDebts = simplifiedDebts.filter(d => d.fromUserId === userId);

  // Build summary line like Splitwise: "X owes you ₹500" or "You owe X ₹500"
  const summaryLine = (() => {
    const owedToUser = simplifiedDebts.filter(d => d.toUserId === userId);
    const userOwes = simplifiedDebts.filter(d => d.fromUserId === userId);
    const totalOwed = owedToUser.reduce((s, d) => s + d.amount, 0);
    const totalOwing = userOwes.reduce((s, d) => s + d.amount, 0);

    if (totalOwed === 0 && totalOwing === 0) return { text: 'All settled up', color: COLORS.success };
    if (totalOwed > totalOwing) {
      const net = totalOwed - totalOwing;
      return { text: `You are owed ${formatCurrency(net)}`, color: COLORS.success };
    }
    const net = totalOwing - totalOwed;
    return { text: `You owe ${formatCurrency(net)}`, color: COLORS.danger };
  })();

  // ─── Timeline ───────────────────────────────────────────────────────────────
  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [
      ...activeGroupTransactions.map(t => ({ kind: 'expense' as const, data: t })),
      ...settlements.map(s => ({ kind: 'settlement' as const, data: s })),
    ];
    items.sort((a, b) => {
      const tsA = a.kind === 'expense' ? a.data.timestamp : a.data.timestamp;
      const tsB = b.kind === 'expense' ? b.data.timestamp : b.data.timestamp;
      return tsB - tsA;
    });
    return items;
  }, [activeGroupTransactions, settlements]);

  const sections = useMemo(() => groupByMonth(timelineItems), [timelineItems]);

  // ─── Settlement Logic ───────────────────────────────────────────────────────
  const getSettleAmountValue = (): number => {
    const parsed = parseFloat(settleAmount);
    return (isNaN(parsed) || parsed <= 0) ? 0 : Math.round(parsed * 100) / 100;
  };

  const openSettleAmountModal = (debt: Debt) => {
    setSettleTarget({ debt });
    setSettleAmount(debt.amount.toString());
    setSettleListVisible(false);
    setSettleModalVisible(true);
  };

  const handleUPISettle = async () => {
    if (!settleTarget) return;
    const amount = getSettleAmountValue();
    if (amount <= 0) { Alert.alert('Invalid Amount', 'Please enter a valid amount.'); return; }
    const upiUrl = `upi://pay?pa=&pn=${encodeURIComponent(settleTarget.debt.toName)}&am=${amount}&cu=INR&tn=Settlement`;
    try {
      const canOpen = await Linking.canOpenURL(upiUrl);
      if (canOpen) {
        setPendingUPISettle({ debt: settleTarget.debt, amount });
        setSettleModalVisible(false);
        setSettleTarget(null);
        await Linking.openURL(upiUrl);
      } else {
        Alert.alert('UPI Not Available', 'No UPI app found on your device.');
      }
    } catch { Alert.alert('Error', 'Could not open UPI app.'); }
  };

  const handleUPIConfirmDone = async () => {
    if (!pendingUPISettle) return;
    setConfirmModalVisible(false);
    await settleForAmount(pendingUPISettle.debt, pendingUPISettle.amount, 'upi');
    setPendingUPISettle(null);
  };

  const handleUPIConfirmNotDone = () => { setConfirmModalVisible(false); setPendingUPISettle(null); };

  const handleCashSettle = () => {
    if (!settleTarget) return;
    const amount = getSettleAmountValue();
    if (amount <= 0) { Alert.alert('Invalid Amount', 'Please enter a valid amount.'); return; }
    Alert.alert(
      'Mark as settled?',
      `Confirm ${formatCurrency(amount)} settled by cash to ${settleTarget.debt.toName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Mark Settled', onPress: async () => { await settleForAmount(settleTarget!.debt, amount, 'cash'); } },
      ],
    );
  };

  const settleForAmount = async (debt: Debt, amount: number, method: 'upi' | 'cash') => {
    const isFullSettlement = amount >= debt.amount;
    let remaining = amount;

    for (const txn of activeGroupTransactions) {
      if (remaining <= 0) break;
      if (txn.addedBy === debt.toUserId) {
        const split = txn.splits.find(s => s.userId === debt.fromUserId && !s.settled);
        if (split) {
          if (remaining >= split.amount) {
            await settleSplit(groupId, txn.id, debt.fromUserId);
            remaining -= split.amount;
          } else { break; }
        }
      }
    }

    const settlementData = {
      groupId, fromUserId: debt.fromUserId, fromName: debt.fromName,
      toUserId: debt.toUserId, toName: debt.toName, amount, method,
    };
    if (isAuthenticated) { await addSettlementCloud(settlementData); }
    else { const { addSettlement } = require('../services/StorageService'); await addSettlement(settlementData); }

    setSettleModalVisible(false);
    setSettleTarget(null);
    await load();

    Alert.alert(
      isFullSettlement ? 'Fully Settled' : 'Partially Settled',
      `${formatCurrency(amount)} to ${debt.toName} via ${method === 'upi' ? 'UPI' : 'Cash'}.${
        !isFullSettlement ? `\n\nRemaining: ${formatCurrency(debt.amount - amount)}` : ''
      }`,
    );
  };

  // ─── Expense Edit/Delete ────────────────────────────────────────────────────
  const openEditExpense = (txn: GroupTransaction) => {
    setEditingTxn({
      txn, amount: String(txn.amount), description: txn.description,
      members: group!.members.map(m => ({
        userId: m.userId,
        displayName: m.userId === userId ? 'You' : m.displayName,
        included: txn.splits.some(s => s.userId === m.userId),
      })),
    });
  };

  const handleUpdateExpense = async () => {
    if (!editingTxn) return;
    const parsedAmount = parseFloat(editingTxn.amount);
    if (!parsedAmount || parsedAmount <= 0) { Alert.alert('Invalid', 'Please enter a valid amount.'); return; }
    const includedMembers = editingTxn.members.filter(m => m.included);
    if (includedMembers.length < 2) { Alert.alert('Need members', 'At least 2 people must be in the split.'); return; }

    setEditSaving(true);
    try {
      const perPerson = Math.round((parsedAmount / includedMembers.length) * 100) / 100;
      const totalSplits = perPerson * includedMembers.length;
      const diff = Math.round((parsedAmount - totalSplits) * 100) / 100;

      const newSplits: Split[] = includedMembers.map((m, i) => {
        const existingSplit = editingTxn.txn.splits.find(s => s.userId === m.userId);
        return {
          userId: m.userId, displayName: m.displayName,
          amount: Math.round((perPerson + (i === includedMembers.length - 1 ? diff : 0)) * 100) / 100,
          settled: existingSplit?.settled ?? (m.userId === editingTxn.txn.addedBy),
        };
      });

      await updateGroupTransaction(groupId, editingTxn.txn.id, {
        amount: parsedAmount, description: editingTxn.description.trim() || 'Group expense', splits: newSplits,
      });
      setEditingTxn(null);
      await load();
    } catch (err: any) { Alert.alert('Error', err?.message || 'Failed to update expense'); }
    finally { setEditSaving(false); }
  };

  const handleDeleteExpense = () => {
    if (!editingTxn) return;
    Alert.alert('Delete Expense', `Delete "${editingTxn.txn.description}" (${formatCurrency(editingTxn.txn.amount)})?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteGroupTransaction(groupId, editingTxn!.txn.id);
        setEditingTxn(null);
        await load();
      }},
    ]);
  };

  const toggleEditMember = (memberId: string) => {
    if (!editingTxn) return;
    setEditingTxn({
      ...editingTxn,
      members: editingTxn.members.map(m => m.userId === memberId ? { ...m, included: !m.included } : m),
    });
  };

  // ─── Render helpers ─────────────────────────────────────────────────────────
  const renderExpenseRow = (txn: GroupTransaction) => {
    const d = new Date(txn.timestamp);
    const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    const day = d.getDate().toString().padStart(2, '0');
    const payer = group!.members.find(m => m.userId === txn.addedBy);
    const payerName = txn.addedBy === userId ? 'You' : (payer?.displayName || 'Someone');
    const userSplit = txn.splits.find(s => s.userId === userId);
    const isNotInvolved = !userSplit;
    const isPayer = txn.addedBy === userId;

    // Right side: what does this mean for the user?
    let rightLabel = '';
    let rightAmount = '';
    let rightColor = COLORS.textSecondary;

    if (isNotInvolved) {
      rightLabel = 'not involved';
    } else if (isPayer) {
      // User paid, others owe them
      const lentAmount = txn.amount - (userSplit?.amount || 0);
      rightLabel = 'you lent';
      rightAmount = formatCurrency(lentAmount);
      rightColor = COLORS.success;
    } else {
      rightLabel = 'you borrowed';
      rightAmount = formatCurrency(userSplit?.amount || 0);
      rightColor = COLORS.danger;
    }

    return (
      <TouchableOpacity
        key={txn.id}
        style={styles.timelineRow}
        onPress={() => openEditExpense(txn)}
        activeOpacity={0.7}
      >
        {/* Date column */}
        <View style={styles.dateCol}>
          <Text style={styles.dateMonth}>{monthShort}</Text>
          <Text style={styles.dateDay}>{day}</Text>
        </View>

        {/* Icon */}
        <View style={[styles.rowIcon, { backgroundColor: `${groupColor}20` }]}>
          <Text style={[styles.rowIconText, { color: groupColor }]}>
            {(txn.merchant || txn.description)[0].toUpperCase()}
          </Text>
        </View>

        {/* Description */}
        <View style={styles.rowInfo}>
          <Text style={styles.rowDesc} numberOfLines={1}>{txn.description}</Text>
          <Text style={styles.rowSub}>{payerName} paid {formatCurrency(txn.amount)}</Text>
        </View>

        {/* User's share */}
        <View style={styles.rowRight}>
          <Text style={[styles.rowRightLabel, { color: rightColor }]}>{rightLabel}</Text>
          {rightAmount ? <Text style={[styles.rowRightAmount, { color: rightColor }]}>{rightAmount}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSettlementRow = (s: Settlement) => {
    const d = new Date(s.timestamp);
    const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    const day = d.getDate().toString().padStart(2, '0');
    const isFrom = s.fromUserId === userId;
    const isTo = s.toUserId === userId;

    return (
      <View key={s.id} style={styles.timelineRow}>
        <View style={styles.dateCol}>
          <Text style={styles.dateMonth}>{monthShort}</Text>
          <Text style={styles.dateDay}>{day}</Text>
        </View>
        <View style={[styles.rowIcon, { backgroundColor: `${COLORS.success}18` }]}>
          <Text style={styles.rowIconText}>{s.method === 'upi' ? '📱' : '💵'}</Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowSub}>
            <Text style={[styles.rowSubBold, isFrom && { color: COLORS.danger }]}>{isFrom ? 'You' : s.fromName}</Text>
            {' paid '}
            <Text style={[styles.rowSubBold, isTo && { color: COLORS.success }]}>{isTo ? 'You' : s.toName}</Text>
            {' '}{formatCurrency(s.amount)}
          </Text>
        </View>
      </View>
    );
  };

  const renderTimelineItem = ({ item }: { item: TimelineItem }) => {
    if (item.kind === 'expense') return renderExpenseRow(item.data);
    return renderSettlementRow(item.data);
  };

  // ─── Main Render ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SectionList
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(item, i) => (item.kind === 'expense' ? item.data.id : item.data.id) + i}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{title}</Text>
          </View>
        )}
        renderItem={renderTimelineItem}
        ListHeaderComponent={
          <>
            {/* Group header — clean, like Splitwise */}
            <View style={styles.header}>
              <View style={[styles.groupIcon, { backgroundColor: `${groupColor}30` }]}>
                <Text style={[styles.groupInitial, { color: groupColor }]}>{(group.name || 'G')[0].toUpperCase()}</Text>
              </View>
              <Text style={styles.groupName}>{group.name}</Text>
              <Text style={[styles.summaryText, { color: summaryLine.color }]}>{summaryLine.text}</Text>

              {/* Action buttons row */}
              <View style={styles.actionRow}>
                {userDebts.length > 0 && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnPrimary]}
                    onPress={() => setSettleListVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionBtnPrimaryText}>Settle up</Text>
                  </TouchableOpacity>
                )}
                {simplifiedDebts.length > 0 && userDebts.length === 0 && (
                  <View style={[styles.actionBtn, styles.actionBtnOutline]}>
                    <Text style={styles.actionBtnOutlineText}>All settled</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Tracker toggle */}
            <View style={styles.trackerWrap}>
              <TrackerToggle
                label="Track for this group"
                subtitle="Auto-detect payments and split equally"
                isActive={isTracking}
                onToggle={() => toggleGroup(groupId)}
                color={COLORS.groupColor}
              />
            </View>

            {timelineItems.length === 0 && (
              <EmptyState
                icon="💸"
                title="No group expenses yet"
                subtitle="Enable tracking above or add an expense manually"
                accent={COLORS.groupColor}
              />
            )}
          </>
        }
        ListFooterComponent={<View style={{ height: 80 }} />}
      />

      {/* Add Expense FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => nav.navigate('SplitEditor', { groupId, isManual: true })}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>Add expense</Text>
      </TouchableOpacity>

      {/* ─── Settle List (who to settle) ─────────────────────────────────────── */}
      <BottomSheet visible={settleListVisible} onClose={() => setSettleListVisible(false)}>
        <Text style={styles.modalTitle}>Select a balance to settle</Text>

        {userDebts.map((debt, i) => (
          <TouchableOpacity
            key={i}
            style={styles.settleRow}
            onPress={() => openSettleAmountModal(debt)}
            activeOpacity={0.7}
          >
            <View style={[styles.settleAvatar, { backgroundColor: `${getColorForId(debt.toUserId)}25` }]}>
              <Text style={[styles.settleAvatarText, { color: getColorForId(debt.toUserId) }]}>
                {debt.toName[0].toUpperCase()}
              </Text>
            </View>
            <Text style={styles.settleName} numberOfLines={1}>{debt.toName}</Text>
            <View style={styles.settleRightCol}>
              <Text style={styles.settleOwedLabel}>you owe</Text>
              <Text style={styles.settleOwedAmount}>{formatCurrency(debt.amount)}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.cancelBtn} onPress={() => setSettleListVisible(false)} activeOpacity={0.7}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* ─── Settlement Amount ───────────────────────────────────────────────── */}
      <BottomSheet visible={settleModalVisible} onClose={() => { setSettleModalVisible(false); setSettleTarget(null); }}>
        <Text style={styles.modalTitle}>Settle Payment</Text>
        {settleTarget && <Text style={styles.modalSub}>Pay to {settleTarget.debt.toName}</Text>}

        {settleTarget && (
          <View style={styles.amountWrap}>
            <View style={styles.totalRow}>
              <Text style={styles.amountLabel}>TOTAL DEBT</Text>
              <Text style={styles.totalValue}>{formatCurrency(settleTarget.debt.amount)}</Text>
            </View>
            <View style={styles.settleAmtSection}>
              <Text style={styles.amountLabel}>SETTLE AMOUNT</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.amountCurrency}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  value={settleAmount}
                  onChangeText={setSettleAmount}
                  keyboardType="numeric"
                  selectTextOnFocus
                  placeholder="0"
                  placeholderTextColor={COLORS.textLight}
                />
              </View>
            </View>
            {getSettleAmountValue() > 0 && (
              <View style={[styles.typeBadge, {
                backgroundColor: getSettleAmountValue() >= settleTarget.debt.amount ? `${COLORS.success}15` : `${COLORS.warning}15`,
                borderColor: getSettleAmountValue() >= settleTarget.debt.amount ? `${COLORS.success}30` : `${COLORS.warning}30`,
              }]}>
                <Text style={[styles.typeBadgeText, {
                  color: getSettleAmountValue() >= settleTarget.debt.amount ? COLORS.success : COLORS.warning,
                }]}>
                  {getSettleAmountValue() >= settleTarget.debt.amount
                    ? 'Full Settlement'
                    : `Partial · Remaining: ${formatCurrency(settleTarget.debt.amount - getSettleAmountValue())}`}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.payOptions}>
          <TouchableOpacity style={styles.payOption} onPress={handleUPISettle} activeOpacity={0.7}>
            <View style={[styles.payOptionIcon, { backgroundColor: `${COLORS.primaryLight}18` }]}>
              <Text style={styles.payOptionEmoji}>📱</Text>
            </View>
            <View style={styles.payOptionInfo}>
              <Text style={styles.payOptionTitle}>Pay via UPI / Card</Text>
              <Text style={styles.payOptionSub}>Opens your payment app</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.payOption} onPress={handleCashSettle} activeOpacity={0.7}>
            <View style={[styles.payOptionIcon, { backgroundColor: `${COLORS.success}18` }]}>
              <Text style={styles.payOptionEmoji}>💵</Text>
            </View>
            <View style={styles.payOptionInfo}>
              <Text style={styles.payOptionTitle}>Settled by Cash</Text>
              <Text style={styles.payOptionSub}>Mark as paid in cash</Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => { setSettleModalVisible(false); setSettleTarget(null); }} activeOpacity={0.7}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* ─── UPI Return Confirmation ─────────────────────────────────────────── */}
      <BottomSheet visible={confirmModalVisible} onClose={() => { setConfirmModalVisible(false); setPendingUPISettle(null); }}>
        <Text style={styles.modalTitle}>Was the payment done?</Text>
        {pendingUPISettle && (
          <Text style={styles.modalSub}>{formatCurrency(pendingUPISettle.amount)} to {pendingUPISettle.debt.toName}</Text>
        )}
        <View style={styles.payOptions}>
          <TouchableOpacity style={[styles.payOption, { borderColor: `${COLORS.success}30` }]} onPress={handleUPIConfirmDone} activeOpacity={0.7}>
            <View style={[styles.payOptionIcon, { backgroundColor: `${COLORS.success}18` }]}>
              <Text style={styles.payOptionEmoji}>✅</Text>
            </View>
            <View style={styles.payOptionInfo}>
              <Text style={styles.payOptionTitle}>Yes, Payment Done</Text>
              <Text style={styles.payOptionSub}>Mark as settled</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.payOption, { borderColor: `${COLORS.danger}30` }]} onPress={handleUPIConfirmNotDone} activeOpacity={0.7}>
            <View style={[styles.payOptionIcon, { backgroundColor: `${COLORS.danger}18` }]}>
              <Text style={styles.payOptionEmoji}>❌</Text>
            </View>
            <View style={styles.payOptionInfo}>
              <Text style={styles.payOptionTitle}>No, Payment Failed</Text>
              <Text style={styles.payOptionSub}>Don't mark as settled</Text>
            </View>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ─── Edit Expense ────────────────────────────────────────────────────── */}
      <BottomSheet visible={!!editingTxn} onClose={() => setEditingTxn(null)}>
        {editingTxn && (
          <>
            <Text style={styles.modalTitle}>Edit Expense</Text>
            <Text style={styles.modalSub}>
              Added by {editingTxn.txn.addedBy === userId ? 'You' : (group.members.find(m => m.userId === editingTxn.txn.addedBy)?.displayName || 'Someone')}
            </Text>

            <Text style={styles.editLabel}>AMOUNT</Text>
            <View style={styles.editAmountRow}>
              <Text style={styles.editCurrency}>₹</Text>
              <TextInput
                style={styles.editAmountInput}
                value={editingTxn.amount}
                onChangeText={v => setEditingTxn({ ...editingTxn, amount: v })}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={COLORS.textLight}
              />
            </View>

            <Text style={styles.editLabel}>DESCRIPTION</Text>
            <TextInput
              style={styles.editDescInput}
              value={editingTxn.description}
              onChangeText={v => setEditingTxn({ ...editingTxn, description: v })}
              placeholder="e.g. Dinner, Groceries..."
              placeholderTextColor={COLORS.textLight}
              maxLength={200}
            />

            <Text style={styles.editLabel}>SPLIT BETWEEN (Equal)</Text>
            <View style={styles.editMembers}>
              {editingTxn.members.map(m => {
                const c = getColorForId(m.userId);
                return (
                  <TouchableOpacity
                    key={m.userId}
                    style={[styles.editChip, m.included && { borderColor: c, backgroundColor: `${c}15` }]}
                    onPress={() => toggleEditMember(m.userId)}
                    activeOpacity={0.7}
                  >
                    {m.included && <Text style={[styles.editCheck, { color: c }]}>✓</Text>}
                    <Text style={[styles.editChipName, m.included ? { color: COLORS.text } : { color: COLORS.textSecondary }]}>{m.displayName}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {(() => {
              const included = editingTxn.members.filter(m => m.included);
              const amt = parseFloat(editingTxn.amount) || 0;
              if (included.length > 0 && amt > 0) {
                return <Text style={styles.splitPreview}>{formatCurrency(Math.round((amt / included.length) * 100) / 100)} each · {included.length} people</Text>;
              }
              return null;
            })()}

            <TouchableOpacity style={[styles.saveBtn, editSaving && { opacity: 0.5 }]} onPress={handleUpdateExpense} disabled={editSaving} activeOpacity={0.8}>
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>{editSaving ? 'Saving...' : 'Save Changes'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteExpense} activeOpacity={0.7}>
              <Text style={styles.deleteBtnText}>Delete Expense</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingTxn(null)} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  // ─── Header (Splitwise-style) ─────────────────────────────────────────────
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  groupIcon: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  groupInitial: { fontSize: 28, fontWeight: '800' },
  groupName: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 4, letterSpacing: -0.3 },
  summaryText: { fontSize: 14, fontWeight: '500', marginBottom: 16 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  actionBtnPrimary: { backgroundColor: COLORS.primary },
  actionBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  actionBtnOutline: { borderWidth: 1, borderColor: `${COLORS.success}40`, backgroundColor: `${COLORS.success}10` },
  actionBtnOutlineText: { fontSize: 14, fontWeight: '600', color: COLORS.success },

  trackerWrap: { paddingHorizontal: 0 },

  // ─── Section Headers ──────────────────────────────────────────────────────
  sectionHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  sectionHeaderText: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },

  // ─── Timeline Rows ────────────────────────────────────────────────────────
  timelineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dateCol: { width: 36, alignItems: 'center', marginRight: 12 },
  dateMonth: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase' },
  dateDay: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowIconText: { fontSize: 16, fontWeight: '800' },
  rowInfo: { flex: 1 },
  rowDesc: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  rowSub: { fontSize: 12, color: COLORS.textSecondary },
  rowSubBold: { fontWeight: '700', color: COLORS.text },
  rowRight: { alignItems: 'flex-end', marginLeft: 8 },
  rowRightLabel: { fontSize: 11, fontWeight: '500' },
  rowRightAmount: { fontSize: 14, fontWeight: '700', marginTop: 1 },

  // ─── FAB ──────────────────────────────────────────────────────────────────
  fab: { position: 'absolute', right: 20, bottom: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30, elevation: 8, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
  fabIcon: { color: '#0A0A0F', fontSize: 20, fontWeight: '800', marginRight: 6 },
  fabText: { color: '#0A0A0F', fontWeight: '800', fontSize: 14, letterSpacing: 0.3 },

  // ─── Settle List Sheet ────────────────────────────────────────────────────
  settleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  settleAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  settleAvatarText: { fontSize: 18, fontWeight: '800' },
  settleName: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  settleRightCol: { alignItems: 'flex-end' },
  settleOwedLabel: { fontSize: 11, color: COLORS.danger, fontWeight: '500' },
  settleOwedAmount: { fontSize: 15, fontWeight: '700', color: COLORS.danger },

  // ─── Shared Modal Styles ──────────────────────────────────────────────────
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  modalSub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 20 },
  cancelBtn: { alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border, marginTop: 10 },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },

  // ─── Amount Wrap ──────────────────────────────────────────────────────────
  amountWrap: { backgroundColor: COLORS.surfaceHigh, borderRadius: 14, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: COLORS.border },
  totalRow: { marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  totalValue: { fontSize: 16, fontWeight: '800', color: COLORS.textSecondary, marginTop: 4 },
  settleAmtSection: { marginBottom: 4 },
  amountLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1, marginBottom: 6 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center' },
  amountCurrency: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginRight: 4 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: '800', color: COLORS.text, padding: 0 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, marginTop: 10 },
  typeBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  // ─── Payment Options ──────────────────────────────────────────────────────
  payOptions: { gap: 12, marginBottom: 10 },
  payOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceHigh, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  payOptionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  payOptionEmoji: { fontSize: 22 },
  payOptionInfo: { flex: 1 },
  payOptionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  payOptionSub: { fontSize: 12, color: COLORS.textSecondary },

  // ─── Edit Expense ─────────────────────────────────────────────────────────
  editLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
  editAmountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceHigh, borderRadius: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  editCurrency: { fontSize: 24, fontWeight: '800', color: COLORS.primary, marginRight: 4 },
  editAmountInput: { flex: 1, fontSize: 28, fontWeight: '800', color: COLORS.text, paddingVertical: 14 },
  editDescInput: { backgroundColor: COLORS.surfaceHigh, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  editMembers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  editChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surfaceHigh },
  editCheck: { fontSize: 12, fontWeight: '800', marginRight: 6 },
  editChipName: { fontSize: 13, fontWeight: '600' },
  splitPreview: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600', marginBottom: 20 },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  saveBtnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  deleteBtn: { paddingVertical: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: `${COLORS.danger}30`, backgroundColor: `${COLORS.danger}08`, marginBottom: 6 },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.danger },
});
