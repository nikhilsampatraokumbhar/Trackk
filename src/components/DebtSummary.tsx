import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Divider, Surface } from 'react-native-paper';
import { Debt } from '../models/types';
import { formatCurrency } from '../utils/helpers';
import { useTheme } from '../store/ThemeContext';

interface Props {
  debts: Debt[];
  currentUserId: string;
}

export default function DebtSummary({ debts, currentUserId }: Props) {
  const { colors } = useTheme();

  if (debts.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.settledRow}>
          <View style={[styles.settledDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.settled, { color: colors.success }]}>All settled up</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.textSecondary }]}>SETTLEMENTS</Text>
      {debts.map((debt, i) => {
        const isUserOwing = debt.fromUserId === currentUserId;
        const isUserOwed = debt.toUserId === currentUserId;
        const color = isUserOwing ? colors.danger : isUserOwed ? colors.success : colors.textSecondary;

        return (
          <View key={i}>
            {i > 0 && <Divider style={{ backgroundColor: colors.border }} />}
            <View style={styles.row}>
              <View style={styles.nameWrap}>
                <Text style={[styles.name, { color: isUserOwing ? colors.danger : colors.text }]}>
                  {debt.fromUserId === currentUserId ? 'You' : debt.fromName}
                </Text>
                <Text style={[styles.owes, { color: colors.textSecondary }]}>owes</Text>
                <Text style={[styles.name, { color: isUserOwed ? colors.success : colors.text }]}>
                  {debt.toUserId === currentUserId ? 'You' : debt.toName}
                </Text>
              </View>
              <Text style={[styles.amount, { color }]}>{formatCurrency(debt.amount)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  settledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  settledDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  settled: {
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '600',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  nameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
  },
  owes: {
    fontSize: 12,
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
  },
});
