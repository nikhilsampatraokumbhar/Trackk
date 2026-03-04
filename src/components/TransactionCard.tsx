import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Transaction } from '../models/types';
import { formatCurrency, formatDate, COLORS } from '../utils/helpers';

interface TransactionCardProps {
  transaction: Transaction;
  onPress?: () => void;
  showTracker?: boolean;
}

const TRACKER_META: Record<string, { label: string; color: string }> = {
  personal:      { label: 'Personal',      color: COLORS.personalColor },
  group:         { label: 'Group',          color: COLORS.groupColor },
  reimbursement: { label: 'Reimbursement', color: COLORS.reimbursementColor },
};

export function TransactionCard({ transaction, onPress, showTracker = false }: TransactionCardProps) {
  const meta = TRACKER_META[transaction.trackerType];
  const initial = (transaction.merchant || transaction.description || '₹')[0].toUpperCase();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}>

      {/* Square avatar — NeoPOP style */}
      <View style={[styles.avatar, { backgroundColor: meta.color + '18' }]}>
        <Text style={[styles.avatarText, { color: meta.color }]}>{initial}</Text>
      </View>

      {/* Details */}
      <View style={styles.details}>
        <Text style={styles.description} numberOfLines={1}>
          {transaction.description}
        </Text>
        <Text style={styles.metaRow}>
          {formatDate(transaction.timestamp)}
          {transaction.source === 'sms' ? '  ·  SMS' : ''}
          {showTracker ? `  ·  ${meta.label}` : ''}
        </Text>
      </View>

      {/* Amount */}
      <Text style={styles.amount}>{formatCurrency(transaction.amount)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 17,
    fontWeight: '800',
  },
  details: { flex: 1, marginRight: 12 },
  description: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  metaRow: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.danger,
    letterSpacing: -0.5,
  },
});
