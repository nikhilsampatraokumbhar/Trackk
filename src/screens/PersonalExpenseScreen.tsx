import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTracker } from '../store/TrackerContext';
import { TrackerToggle } from '../components/TrackerToggle';
import { TransactionCard } from '../components/TransactionCard';
import { Transaction, RootStackParamList } from '../models/types';
import { subscribeToTransactions } from '../services/FirebaseService';
import { formatCurrency, COLORS } from '../utils/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PersonalExpenseScreen() {
  const navigation = useNavigation<Nav>();
  const { trackerState, togglePersonal } = useTracker();
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useFocusEffect(
    useCallback(() => {
      const unsub = subscribeToTransactions('personal', undefined, setTransactions);
      return unsub;
    }, []),
  );

  const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
  const thisMonth = transactions.filter(t => {
    const d = new Date(t.timestamp);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlySpent = thisMonth.reduce((sum, t) => sum + t.amount, 0);

  return (
    <View style={styles.container}>
      <FlatList
        data={transactions}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            {/* Tracker toggle */}
            <TrackerToggle
              label="Personal Tracking"
              subtitle="Auto-detect transactions from SMS"
              isActive={trackerState.personal}
              color={COLORS.personalColor}
              onToggle={togglePersonal}
            />

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>This Month</Text>
                <Text style={styles.statAmount}>{formatCurrency(monthlySpent)}</Text>
                <Text style={styles.statCount}>{thisMonth.length} transactions</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>All Time</Text>
                <Text style={styles.statAmount}>{formatCurrency(totalSpent)}</Text>
                <Text style={styles.statCount}>{transactions.length} transactions</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>All Transactions</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TransactionCard
            transaction={item}
            onPress={() =>
              navigation.navigate('TransactionDetail', {
                transactionId: item.id,
                trackerType: 'personal',
              })
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No personal expenses yet</Text>
            <Text style={styles.emptySubtitle}>
              {trackerState.personal
                ? 'Waiting for bank SMS notifications...'
                : 'Enable tracking above to get started'}
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
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  statAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  statCount: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
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
    textAlign: 'center',
  },
});
