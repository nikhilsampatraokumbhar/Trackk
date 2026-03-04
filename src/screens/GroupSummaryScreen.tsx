import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useGroups } from '../store/GroupContext';
import { formatCurrency, COLORS, getColorForId } from '../utils/helpers';
import { GroupTransaction, RootStackParamList } from '../models/types';

type RouteProps = RouteProp<RootStackParamList, 'GroupSummary'>;

type PeriodKey = '1m' | '3m' | 'all';

function periodLabel(key: PeriodKey): string {
  return key === '1m' ? 'This Month' : key === '3m' ? 'Last 3 Months' : 'All Time';
}

function startOfMonth(monthsBack: number): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - monthsBack);
  return d.getTime();
}

function monthLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

interface MemberStat {
  userId: string;
  displayName: string;
  totalPaid: number;
  totalShare: number;
  netBalance: number; // positive = owed back, negative = owes others
}

export function GroupSummaryScreen() {
  const route = useRoute<RouteProps>();
  const { groupId } = route.params;
  const { groups, activeGroupTransactions, loadGroupTransactions } = useGroups();

  const [period, setPeriod] = useState<PeriodKey>('1m');

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

  // Filter by period
  const cutoff =
    period === '1m'
      ? startOfMonth(0)
      : period === '3m'
      ? startOfMonth(3)
      : 0;

  const filtered = activeGroupTransactions.filter(t => t.timestamp >= cutoff);

  const totalSpent = filtered.reduce((s, t) => s + t.amount, 0);

  // Per-member stats
  const memberMap = new Map<string, MemberStat>();

  group.members.forEach(m => {
    memberMap.set(m.userId || m.displayName, {
      userId: m.userId || m.displayName,
      displayName: m.displayName,
      totalPaid: 0,
      totalShare: 0,
      netBalance: 0,
    });
  });

  filtered.forEach(txn => {
    const payer = memberMap.get(txn.addedBy);
    if (payer) payer.totalPaid += txn.amount;

    txn.splits.forEach(split => {
      const key = split.userId || split.displayName;
      if (!memberMap.has(key)) {
        memberMap.set(key, {
          userId: key,
          displayName: split.displayName,
          totalPaid: 0,
          totalShare: 0,
          netBalance: 0,
        });
      }
      const stat = memberMap.get(key)!;
      stat.totalShare += split.amount;
    });
  });

  // netBalance = totalPaid - totalShare (positive = others owe you)
  memberMap.forEach(stat => {
    stat.netBalance = stat.totalPaid - stat.totalShare;
  });

  const memberStats = Array.from(memberMap.values()).sort(
    (a, b) => b.totalPaid - a.totalPaid,
  );

  // Monthly breakdown
  const monthlyMap = new Map<string, number>();
  filtered.forEach(txn => {
    const key = monthLabel(txn.timestamp);
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + txn.amount);
  });
  const months = Array.from(monthlyMap.entries()).sort((a, b) =>
    new Date(a[0]).getTime() - new Date(b[0]).getTime(),
  );

  return (
    <ScrollView style={styles.container}>
      {/* Period selector */}
      <View style={styles.periodRow}>
        {(['1m', '3m', 'all'] as PeriodKey[]).map(key => (
          <TouchableOpacity
            key={key}
            style={[styles.periodTab, period === key && styles.periodTabActive]}
            onPress={() => setPeriod(key)}>
            <Text style={[styles.periodTabText, period === key && styles.periodTabTextActive]}>
              {periodLabel(key)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Total */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Spent ({periodLabel(period)})</Text>
        <Text style={styles.totalAmount}>{formatCurrency(totalSpent)}</Text>
        <Text style={styles.totalTxnCount}>{filtered.length} transactions</Text>
      </View>

      {/* Monthly breakdown */}
      {months.length > 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Month-wise Breakdown</Text>
          {months.map(([month, amount]) => {
            const pct = totalSpent > 0 ? amount / totalSpent : 0;
            return (
              <View key={month} style={styles.monthRow}>
                <View style={styles.monthBarContainer}>
                  <View style={styles.monthBarLabels}>
                    <Text style={styles.monthLabel}>{month}</Text>
                    <Text style={styles.monthAmount}>{formatCurrency(amount)}</Text>
                  </View>
                  <View style={styles.monthBarTrack}>
                    <View
                      style={[
                        styles.monthBarFill,
                        { width: `${Math.round(pct * 100)}%` },
                      ]}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Per-member summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Who Paid What</Text>
        {memberStats.map(stat => (
          <View key={stat.userId} style={styles.memberCard}>
            <View style={[styles.memberAvatar, { backgroundColor: getColorForId(stat.userId) }]}>
              <Text style={styles.memberAvatarText}>
                {stat.displayName[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{stat.displayName}</Text>
              <View style={styles.memberStats}>
                <View style={styles.memberStat}>
                  <Text style={styles.memberStatLabel}>Paid</Text>
                  <Text style={styles.memberStatValue}>{formatCurrency(stat.totalPaid)}</Text>
                </View>
                <View style={styles.memberStat}>
                  <Text style={styles.memberStatLabel}>Share</Text>
                  <Text style={styles.memberStatValue}>{formatCurrency(stat.totalShare)}</Text>
                </View>
                <View style={styles.memberStat}>
                  <Text style={styles.memberStatLabel}>Net</Text>
                  <Text
                    style={[
                      styles.memberStatValue,
                      {
                        color:
                          stat.netBalance > 0
                            ? COLORS.success
                            : stat.netBalance < 0
                            ? COLORS.danger
                            : COLORS.textSecondary,
                        fontWeight: '800',
                      },
                    ]}>
                    {stat.netBalance > 0 ? '+' : ''}
                    {formatCurrency(stat.netBalance)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  errorText: { color: COLORS.danger, textAlign: 'center', marginTop: 40, fontSize: 16 },

  periodRow: {
    flexDirection: 'row',
    margin: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 4,
    elevation: 1,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodTabActive: { backgroundColor: COLORS.primary },
  periodTabText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  periodTabTextActive: { color: '#FFFFFF' },

  totalCard: {
    backgroundColor: COLORS.primary,
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    elevation: 3,
  },
  totalLabel: { fontSize: 13, color: '#FFFFFF99', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalAmount: { fontSize: 38, fontWeight: '900', color: '#FFFFFF', marginVertical: 4 },
  totalTxnCount: { fontSize: 13, color: '#FFFFFFCC' },

  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 10 },

  monthRow: { marginBottom: 10 },
  monthBarContainer: {},
  monthBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  monthLabel: { fontSize: 13, color: COLORS.textSecondary },
  monthAmount: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  monthBarTrack: { height: 8, backgroundColor: COLORS.border, borderRadius: 4, overflow: 'hidden' },
  monthBarFill: { height: '100%', backgroundColor: COLORS.groupColor, borderRadius: 4 },

  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    elevation: 1,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  memberAvatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  memberStats: { flexDirection: 'row', justifyContent: 'space-between' },
  memberStat: { alignItems: 'center' },
  memberStatLabel: { fontSize: 11, color: COLORS.textLight, marginBottom: 2 },
  memberStatValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },
});
