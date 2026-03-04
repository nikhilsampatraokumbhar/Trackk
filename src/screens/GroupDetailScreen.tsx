import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, Linking, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import { useAuth } from '../store/AuthContext';
import { getGroup, addSettlement, getSettlements, removeSplitMember } from '../services/StorageService';
import { Group, Settlement, Debt } from '../models/types';
import { simplifyDebts } from '../services/DebtCalculator';
import TrackerToggle from '../components/TrackerToggle';
import DebtSummary from '../components/DebtSummary';
import GroupMemberCard from '../components/GroupMemberCard';
import { COLORS, formatCurrency, formatDate, getColorForId } from '../utils/helpers';

type Route = RouteProp<RootStackParamList, 'GroupDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

interface SettleTarget {
  debt: Debt;
}

export default function GroupDetailScreen() {
  const route = useRoute<Route>();
  const nav = useNavigation<Nav>();
  const { groupId } = route.params;
  const { user } = useAuth();
  const { activeGroupTransactions, activeGroupDebts, loadGroupTransactions, settleSplit, groups } = useGroups();
  const { trackerState, toggleGroup } = useTracker();

  const [group, setGroup] = useState<Group | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  const load = useCallback(async () => {
    const g = await getGroup(groupId);
    setGroup(g);
    await loadGroupTransactions(groupId);
    const s = await getSettlements(groupId);
    setSettlements(s.sort((a, b) => b.timestamp - a.timestamp));
  }, [groupId, loadGroupTransactions]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!group) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const isTracking = trackerState.activeGroupIds.includes(groupId);
  const totalSpent = activeGroupTransactions.reduce((s, t) => s + t.amount, 0);
  const groupColor = getColorForId(group.id);
  const userId = user?.id || '';
  const simplifiedDebts = simplifyDebts(activeGroupDebts);

  // Calculate each member's total owed/owing across all transactions
  const getMemberTotals = (memberUserId: string): { totalOwed: number; totalOwing: number } => {
    let totalOwed = 0;  // others owe this member
    let totalOwing = 0; // this member owes others

    activeGroupTransactions.forEach(txn => {
      // If this member paid for the transaction
      if (txn.addedBy === memberUserId) {
        // Others owe this member their split amounts (unsettled only)
        txn.splits.forEach(split => {
          if (split.userId !== memberUserId && !split.settled) {
            totalOwed += split.amount;
          }
        });
      } else {
        // This member owes the payer their split amount (if unsettled)
        const memberSplit = txn.splits.find(s => s.userId === memberUserId);
        if (memberSplit && !memberSplit.settled) {
          totalOwing += memberSplit.amount;
        }
      }
    });

    return { totalOwed, totalOwing };
  };

  // Open settle modal for a specific debt
  const openSettleModal = (debt: Debt) => {
    setSettleTarget({ debt });
    setSettleModalVisible(true);
  };

  // Handle settlement via UPI
  const handleUPISettle = () => {
    if (!settleTarget) return;

    Alert.alert(
      'Mark as settled?',
      `Confirm settlement of ${formatCurrency(settleTarget.debt.amount)} to ${settleTarget.debt.toName} via UPI?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Open UPI',
          onPress: async () => {
            // Try to open UPI intent
            const upiUrl = `upi://pay?pa=&pn=${encodeURIComponent(settleTarget.debt.toName)}&am=${settleTarget.debt.amount}&cu=INR&tn=Settlement`;
            try {
              const canOpen = await Linking.canOpenURL(upiUrl);
              if (canOpen) {
                await Linking.openURL(upiUrl);
              } else {
                Alert.alert(
                  'UPI Not Available',
                  'No UPI app found on your device. Please pay using your preferred UPI app and come back to mark as settled.',
                );
              }
            } catch {
              Alert.alert('Error', 'Could not open UPI app. Please pay manually.');
            }

            // Mark all splits for that person as settled and record settlement
            await settleAllForUser(settleTarget.debt, 'upi');
          },
        },
      ],
    );
  };

  // Handle settlement via cash
  const handleCashSettle = () => {
    if (!settleTarget) return;

    Alert.alert(
      'Mark as settled?',
      `Confirm that ${formatCurrency(settleTarget.debt.amount)} has been settled by cash to ${settleTarget.debt.toName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Mark Settled',
          onPress: async () => {
            await settleAllForUser(settleTarget.debt, 'cash');
          },
        },
      ],
    );
  };

  // Settle all splits for a given debt and record settlement
  const settleAllForUser = async (debt: Debt, method: 'upi' | 'cash') => {
    // Settle all individual splits where this user owes the creditor
    for (const txn of activeGroupTransactions) {
      if (txn.addedBy === debt.toUserId) {
        const split = txn.splits.find(s => s.userId === debt.fromUserId && !s.settled);
        if (split) {
          await settleSplit(groupId, txn.id, debt.fromUserId);
        }
      }
    }

    // Record the settlement
    await addSettlement({
      groupId,
      fromUserId: debt.fromUserId,
      fromName: debt.fromName,
      toUserId: debt.toUserId,
      toName: debt.toName,
      amount: debt.amount,
      method,
    });

    setSettleModalVisible(false);
    setSettleTarget(null);
    await load();

    Alert.alert(
      'Settlement Recorded',
      `${formatCurrency(debt.amount)} to ${debt.toName} has been settled via ${method === 'upi' ? 'UPI' : 'Cash'}.`,
    );
  };

  // Handle removing a member from a specific split
  const handleRemoveSplitMember = (transactionId: string, memberUserId: string, memberName: string) => {
    Alert.alert(
      'Remove from split?',
      `Remove ${memberName} from this expense? The amount will be re-split among remaining members.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeSplitMember(groupId, transactionId, memberUserId);
            await load();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
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
      >
        {/* Group header */}
        <LinearGradient
          colors={[`${groupColor}25`, COLORS.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.header}
        >
          <View style={[styles.groupIcon, { backgroundColor: `${groupColor}30` }]}>
            <Text style={[styles.groupInitial, { color: groupColor }]}>
              {group.name[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.groupName}>{group.name}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>
                {group.members.length} members
              </Text>
            </View>
            <View style={[styles.metaChip, { backgroundColor: `${groupColor}20` }]}>
              <Text style={[styles.metaChipText, { color: groupColor }]}>
                {formatCurrency(totalSpent)} total
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Tracker toggle */}
        <TrackerToggle
          label="Track for this group"
          subtitle="Auto-detect payments and split equally"
          isActive={isTracking}
          onToggle={() => toggleGroup(groupId)}
          color={COLORS.groupColor}
        />

        {/* Settle Up section with simplified debts */}
        <Text style={styles.sectionTitle}>SETTLE UP</Text>
        <View style={styles.debtSection}>
          {simplifiedDebts.length === 0 ? (
            <View style={styles.debtCard}>
              <View style={styles.settledUpRow}>
                <View style={styles.settledUpDot} />
                <Text style={styles.settledUpText}>All settled up</Text>
              </View>
            </View>
          ) : (
            <View style={styles.debtCard}>
              <Text style={styles.debtTitle}>SIMPLIFIED DEBTS</Text>
              {simplifiedDebts.map((debt, i) => {
                const isUserOwing = debt.fromUserId === userId;
                const isUserOwed = debt.toUserId === userId;
                const color = isUserOwing ? COLORS.danger : isUserOwed ? COLORS.success : COLORS.textSecondary;

                return (
                  <View key={i} style={styles.debtRow}>
                    <View style={styles.debtInfo}>
                      <View style={styles.debtNameWrap}>
                        <Text style={[styles.debtName, isUserOwing && { color: COLORS.danger }]}>
                          {debt.fromUserId === userId ? 'You' : debt.fromName}
                        </Text>
                        <Text style={styles.debtOwes}>owes</Text>
                        <Text style={[styles.debtName, isUserOwed && { color: COLORS.success }]}>
                          {debt.toUserId === userId ? 'You' : debt.toName}
                        </Text>
                      </View>
                      <Text style={[styles.debtAmount, { color }]}>{formatCurrency(debt.amount)}</Text>
                    </View>
                    {isUserOwing && (
                      <TouchableOpacity
                        style={styles.settleDebtBtn}
                        onPress={() => openSettleModal(debt)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.settleDebtBtnText}>Settle</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Members */}
        <Text style={styles.sectionTitle}>MEMBERS</Text>
        {group.members.map(member => {
          const totals = getMemberTotals(member.userId);
          return (
            <View key={member.userId} style={styles.memberCardWrap}>
              <GroupMemberCard
                member={member}
                debts={activeGroupDebts}
                currentUserId={userId}
              />
              {(totals.totalOwed > 0 || totals.totalOwing > 0) && (
                <View style={styles.memberTotalRow}>
                  {totals.totalOwed > 0 && (
                    <View style={[styles.memberTotalChip, { backgroundColor: `${COLORS.success}12`, borderColor: `${COLORS.success}25` }]}>
                      <Text style={[styles.memberTotalText, { color: COLORS.success }]}>
                        Owed: {formatCurrency(totals.totalOwed)}
                      </Text>
                    </View>
                  )}
                  {totals.totalOwing > 0 && (
                    <View style={[styles.memberTotalChip, { backgroundColor: `${COLORS.danger}12`, borderColor: `${COLORS.danger}25` }]}>
                      <Text style={[styles.memberTotalText, { color: COLORS.danger }]}>
                        Owes: {formatCurrency(totals.totalOwing)}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* Transactions */}
        <Text style={styles.sectionTitle}>
          EXPENSES ({activeGroupTransactions.length})
        </Text>

        {activeGroupTransactions.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyEmoji}>💸</Text>
            </View>
            <Text style={styles.emptyText}>No group expenses yet</Text>
            <Text style={styles.emptySubtext}>
              Enable tracking above and make a payment to see it here
            </Text>
          </View>
        ) : (
          activeGroupTransactions.map(txn => (
            <View key={txn.id} style={styles.txnCard}>
              {/* Transaction header */}
              <View style={styles.txnHeader}>
                <View style={[styles.txnIcon, { backgroundColor: `${groupColor}20` }]}>
                  <Text style={[styles.txnIconText, { color: groupColor }]}>
                    {(txn.merchant || txn.description)[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.txnInfo}>
                  <Text style={styles.txnDesc} numberOfLines={1}>{txn.description}</Text>
                  <Text style={styles.txnDate}>{formatDate(txn.timestamp)}</Text>
                </View>
                <Text style={styles.txnAmount}>{formatCurrency(txn.amount)}</Text>
              </View>

              {/* Split label */}
              <View style={styles.splitHeader}>
                <Text style={styles.splitHeaderText}>
                  Split {txn.splits.length} ways · {formatCurrency(txn.splits[0]?.amount || 0)} each
                </Text>
              </View>

              {/* Splits */}
              {txn.splits.map(split => (
                <View key={split.userId} style={styles.splitRow}>
                  <View style={styles.splitLeft}>
                    <View style={[
                      styles.splitAvatar,
                      { backgroundColor: `${getColorForId(split.userId)}25` },
                    ]}>
                      <Text style={[styles.splitAvatarText, { color: getColorForId(split.userId) }]}>
                        {split.displayName[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.splitDetails}>
                      <Text style={styles.splitName}>
                        {split.userId === userId ? 'You' : split.displayName}
                      </Text>
                      <Text style={styles.splitAmt}>{formatCurrency(split.amount)}</Text>
                    </View>
                  </View>
                  <View style={styles.splitActions}>
                    {split.settled ? (
                      <View style={styles.settledBadge}>
                        <Text style={styles.settledText}>Settled</Text>
                      </View>
                    ) : split.userId !== txn.addedBy ? (
                      <TouchableOpacity
                        style={styles.settleBtn}
                        onPress={() => settleSplit(groupId, txn.id, split.userId)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.settleBtnText}>Mark Settled</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.payerBadge}>
                        <Text style={styles.payerText}>Paid</Text>
                      </View>
                    )}
                    {/* Remove from split button - only for non-payer members and if more than 2 splits */}
                    {split.userId !== txn.addedBy && txn.splits.length > 2 && (
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => handleRemoveSplitMember(txn.id, split.userId, split.displayName)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.removeBtnText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ))
        )}

        {/* Settlement History */}
        {settlements.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              SETTLEMENT HISTORY ({settlements.length})
            </Text>
            {settlements.map(s => {
              const isFrom = s.fromUserId === userId;
              const isTo = s.toUserId === userId;
              return (
                <View key={s.id} style={styles.settlementCard}>
                  <View style={styles.settlementHeader}>
                    <View style={[
                      styles.settlementMethodBadge,
                      { backgroundColor: s.method === 'upi' ? `${COLORS.primaryLight}18` : `${COLORS.success}18` },
                    ]}>
                      <Text style={styles.settlementMethodEmoji}>
                        {s.method === 'upi' ? '📱' : '💵'}
                      </Text>
                    </View>
                    <View style={styles.settlementInfo}>
                      <Text style={styles.settlementText}>
                        <Text style={[styles.settlementName, isFrom && { color: COLORS.danger }]}>
                          {isFrom ? 'You' : s.fromName}
                        </Text>
                        {' paid '}
                        <Text style={[styles.settlementName, isTo && { color: COLORS.success }]}>
                          {isTo ? 'You' : s.toName}
                        </Text>
                      </Text>
                      <Text style={styles.settlementDate}>{formatDate(s.timestamp)}</Text>
                    </View>
                    <View style={styles.settlementRight}>
                      <Text style={styles.settlementAmount}>{formatCurrency(s.amount)}</Text>
                      <View style={[
                        styles.settlementMethodTag,
                        { borderColor: s.method === 'upi' ? `${COLORS.primary}40` : `${COLORS.success}40` },
                      ]}>
                        <Text style={[
                          styles.settlementMethodText,
                          { color: s.method === 'upi' ? COLORS.primary : COLORS.success },
                        ]}>
                          {s.method === 'upi' ? 'UPI' : 'Cash'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Settlement Modal - Bottom Sheet */}
      <Modal
        visible={settleModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSettleModalVisible(false);
          setSettleTarget(null);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setSettleModalVisible(false);
            setSettleTarget(null);
          }}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Settle Payment</Text>
            {settleTarget && (
              <Text style={styles.modalSubtitle}>
                Pay {formatCurrency(settleTarget.debt.amount)} to{' '}
                {settleTarget.debt.toUserId === userId ? 'yourself' : settleTarget.debt.toName}
              </Text>
            )}

            <View style={styles.modalOptions}>
              {/* UPI Option */}
              <TouchableOpacity
                style={styles.modalOption}
                onPress={handleUPISettle}
                activeOpacity={0.7}
              >
                <View style={[styles.modalOptionIcon, { backgroundColor: `${COLORS.primaryLight}18` }]}>
                  <Text style={styles.modalOptionEmoji}>📱</Text>
                </View>
                <View style={styles.modalOptionInfo}>
                  <Text style={styles.modalOptionTitle}>Pay via UPI</Text>
                  <Text style={styles.modalOptionSubtitle}>Opens your UPI app to complete payment</Text>
                </View>
              </TouchableOpacity>

              {/* Cash Option */}
              <TouchableOpacity
                style={styles.modalOption}
                onPress={handleCashSettle}
                activeOpacity={0.7}
              >
                <View style={[styles.modalOptionIcon, { backgroundColor: `${COLORS.success}18` }]}>
                  <Text style={styles.modalOptionEmoji}>💵</Text>
                </View>
                <View style={styles.modalOptionInfo}>
                  <Text style={styles.modalOptionTitle}>Settled by Cash</Text>
                  <Text style={styles.modalOptionSubtitle}>Mark as paid in cash or other method</Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => {
                setSettleModalVisible(false);
                setSettleTarget(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  header: {
    padding: 24,
    alignItems: 'center',
    marginBottom: 4,
  },
  groupIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  groupInitial: { fontSize: 32, fontWeight: '800' },
  groupName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  metaRow: { flexDirection: 'row', gap: 8 },
  metaChip: {
    backgroundColor: COLORS.surfaceHigh,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 16,
    paddingHorizontal: 16,
  },

  // Debt summary section
  debtSection: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  debtCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  settledUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  settledUpDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: 8,
  },
  settledUpText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.success,
  },
  debtTitle: {
    fontSize: 10,
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    fontWeight: '700',
    marginBottom: 12,
  },
  debtRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  debtInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  debtNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  debtName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  debtOwes: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  debtAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  settleDebtBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  settleDebtBtnText: {
    fontSize: 12,
    color: COLORS.background,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Member card wrap with totals
  memberCardWrap: {
    paddingHorizontal: 16,
  },
  memberTotalRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: -4,
    marginBottom: 8,
    paddingLeft: 54,
  },
  memberTotalChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  memberTotalText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Empty state
  empty: { alignItems: 'center', padding: 40 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyEmoji: { fontSize: 28 },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  emptySubtext: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  // Transaction cards
  txnCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  txnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  txnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txnIconText: { fontSize: 16, fontWeight: '800' },
  txnInfo: { flex: 1 },
  txnDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  txnDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  txnAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.danger,
  },
  splitHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.surfaceHigh,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  splitHeaderText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  splitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  splitDetails: {
    flex: 1,
  },
  splitAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  splitAvatarText: { fontSize: 13, fontWeight: '800' },
  splitName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  splitAmt: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  splitActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settledBadge: {
    backgroundColor: `${COLORS.success}18`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${COLORS.success}30`,
  },
  settledText: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '700',
  },
  settleBtn: {
    backgroundColor: COLORS.surfaceHigher,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${COLORS.primary}40`,
  },
  settleBtnText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '700',
  },
  payerBadge: {
    backgroundColor: `${COLORS.primary}15`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  payerText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '700',
  },
  removeBtn: {
    backgroundColor: `${COLORS.danger}12`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${COLORS.danger}25`,
  },
  removeBtnText: {
    fontSize: 10,
    color: COLORS.danger,
    fontWeight: '700',
  },

  // Settlement history
  settlementCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  settlementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settlementMethodBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settlementMethodEmoji: {
    fontSize: 18,
  },
  settlementInfo: {
    flex: 1,
  },
  settlementText: {
    fontSize: 13,
    color: COLORS.text,
  },
  settlementName: {
    fontWeight: '700',
    color: COLORS.text,
  },
  settlementDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  settlementRight: {
    alignItems: 'flex-end',
  },
  settlementAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 4,
  },
  settlementMethodTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  settlementMethodText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Settlement Modal (bottom sheet style)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surfaceHigher,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 24,
    lineHeight: 19,
  },
  modalOptions: {
    gap: 12,
    marginBottom: 20,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  modalOptionEmoji: {
    fontSize: 22,
  },
  modalOptionInfo: {
    flex: 1,
  },
  modalOptionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 3,
  },
  modalOptionSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  modalCancel: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceHigh,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
});
