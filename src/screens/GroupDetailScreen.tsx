import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import { useAuth } from '../store/AuthContext';
import { TrackerToggle } from '../components/TrackerToggle';
import { DebtSummaryCard } from '../components/DebtSummary';
import { GroupMemberCard } from '../components/GroupMemberCard';
import { GroupTransaction, RootStackParamList } from '../models/types';
import { formatCurrency, formatDate, COLORS, getColorForId } from '../utils/helpers';

type RouteProps = RouteProp<RootStackParamList, 'GroupDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function GroupDetailScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<Nav>();
  const { groupId } = route.params;
  const { groups, activeGroupTransactions, activeGroupDebts, loadGroupTransactions, settleSplit } = useGroups();
  const { trackerState, toggleGroup } = useTracker();
  const { user } = useAuth();

  const group = groups.find(g => g.id === groupId);

  useEffect(() => {
    loadGroupTransactions(groupId);
  }, [groupId]);

  if (!group) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Group not found</Text>
      </View>
    );
  }

  const totalGroupSpent = activeGroupTransactions.reduce((sum, t) => sum + t.amount, 0);
  const isTracking = trackerState.activeGroupIds.includes(groupId);

  const renderTransaction = ({ item }: { item: GroupTransaction }) => {
    const payer = group.members.find(m => m.userId === item.addedBy);
    return (
      <View style={styles.txnCard}>
        <View style={styles.txnHeader}>
          <View style={[styles.txnIcon, { backgroundColor: getColorForId(item.addedBy) }]}>
            <Text style={styles.txnIconText}>
              {payer?.displayName?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.txnInfo}>
            <Text style={styles.txnDesc}>{item.description}</Text>
            <Text style={styles.txnMeta}>
              Paid by {payer?.displayName || 'Unknown'} · {formatDate(item.timestamp)}
            </Text>
          </View>
          <Text style={styles.txnAmount}>{formatCurrency(item.amount)}</Text>
        </View>

        {/* Splits */}
        <View style={styles.splitsContainer}>
          {item.splits.map((split, idx) => (
            <View key={idx} style={styles.splitRow}>
              <Text style={styles.splitName}>{split.displayName}</Text>
              <View style={styles.splitRight}>
                <Text style={styles.splitAmount}>
                  {formatCurrency(split.amount)}
                </Text>
                {split.settled ? (
                  <View style={styles.settledBadge}>
                    <Text style={styles.settledText}>Paid</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.settleButton}
                    onPress={() =>
                      settleSplit(groupId, item.id, split.userId)
                    }>
                    <Text style={styles.settleButtonText}>Settle</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={activeGroupTransactions}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            {/* Group info header */}
            <View style={styles.header}>
              <View
                style={[
                  styles.groupIcon,
                  { backgroundColor: getColorForId(groupId) },
                ]}>
                <Text style={styles.groupIconText}>
                  {group.name[0].toUpperCase()}
                </Text>
              </View>
              <Text style={styles.groupName}>{group.name}</Text>
              <Text style={styles.groupMeta}>
                {group.members.length} members · Total: {formatCurrency(totalGroupSpent)}
              </Text>
              <TouchableOpacity
                style={styles.summaryButton}
                onPress={() => navigation.navigate('GroupSummary', { groupId })}>
                <Text style={styles.summaryButtonText}>View Summary</Text>
              </TouchableOpacity>
            </View>

            {/* Tracker toggle */}
            <TrackerToggle
              label={`Track ${group.name}`}
              subtitle="Auto-detect & split new transactions"
              isActive={isTracking}
              color={COLORS.groupColor}
              onToggle={() => toggleGroup(groupId)}
            />

            {/* Debt summary */}
            <DebtSummaryCard
              debts={activeGroupDebts}
              currentUserId={user?.id || ''}
              groupId={groupId}
            />

            {/* Members */}
            <Text style={styles.sectionTitle}>Members</Text>
            {group.members.map((member, idx) => (
              <GroupMemberCard
                key={idx}
                member={member}
                debts={activeGroupDebts}
                currentUserId={user?.id || ''}
              />
            ))}

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
              Transactions
            </Text>
          </View>
        }
        renderItem={renderTransaction}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptySubtitle}>
              {isTracking
                ? 'Waiting for bank SMS to auto-add...'
                : 'Enable tracking to auto-detect expenses'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.danger,
    textAlign: 'center',
    marginTop: 40,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  groupIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  groupIconText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  groupName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  groupMeta: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  txnCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    padding: 14,
    elevation: 1,
  },
  txnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  txnIconText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  txnInfo: {
    flex: 1,
  },
  txnDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  txnMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  txnAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.danger,
  },
  splitsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  splitName: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  splitRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  splitAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: 8,
  },
  settledBadge: {
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  settledText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.success,
  },
  settleButton: {
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  settleButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  summaryButton: {
    marginTop: 10,
    backgroundColor: COLORS.primary + '15',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  summaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 6,
  },
});
