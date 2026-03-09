import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Transaction } from '../models/types';
import { formatCurrency, formatDate, COLORS } from '../utils/helpers';

interface Props {
  transaction: Transaction;
  onPress?: () => void;
  showBadge?: boolean;
}

const TRACKER_COLORS: Record<string, string> = {
  personal: COLORS.personalColor,
  reimbursement: COLORS.reimbursementColor,
  group: COLORS.groupColor,
};

const TRACKER_LABELS: Record<string, string> = {
  personal: 'Personal',
  reimbursement: 'Reimburse',
  group: 'Group',
};

export default function TransactionCard({ transaction, onPress, showBadge }: Props) {
  const color = TRACKER_COLORS[transaction.trackerType] || COLORS.primary;
  const initial = (transaction.merchant || transaction.description)[0].toUpperCase();

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Icon */}
      <View style={[styles.icon, { backgroundColor: `${color}20` }]}>
        <Text style={[styles.iconText, { color }]}>{initial}</Text>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.desc} numberOfLines={1}>{transaction.description}</Text>
        <Text style={styles.date}>{formatDate(transaction.timestamp)}</Text>
        {transaction.note ? (
          <Text style={styles.note} numberOfLines={1}>{transaction.note}</Text>
        ) : null}
        {transaction.tags && transaction.tags.length > 0 && (
          <View style={styles.tagRow}>
            {transaction.tags.slice(0, 3).map(tag => (
              <View key={tag} style={styles.tagMini}>
                <Text style={styles.tagMiniText}>{tag}</Text>
              </View>
            ))}
            {transaction.tags.length > 3 && (
              <Text style={styles.tagMore}>+{transaction.tags.length - 3}</Text>
            )}
          </View>
        )}
      </View>

      {/* Right side */}
      <View style={styles.right}>
        <Text style={styles.amount}>-{formatCurrency(transaction.amount)}</Text>
        {showBadge && (
          <View style={[styles.badge, { backgroundColor: `${color}18` }]}>
            <Text style={[styles.badgeText, { color }]}>
              {TRACKER_LABELS[transaction.trackerType] || transaction.trackerType}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconText: { fontSize: 18, fontWeight: '800' },
  info: { flex: 1 },
  desc: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  date: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  note: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    alignItems: 'center',
  },
  tagMini: {
    backgroundColor: `${COLORS.primary}12`,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tagMiniText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.primary,
  },
  tagMore: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.danger,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
