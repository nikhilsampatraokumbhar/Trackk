import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Debt, RootStackParamList } from '../models/types';
import { formatCurrency, COLORS, getColorForId } from '../utils/helpers';

interface DebtSummaryProps {
  debts: Debt[];
  currentUserId: string;
  groupId: string;
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Shows a visual summary of who owes whom in a group.
 * Highlights amounts the current user owes or is owed.
 * Shows a "Settle" button when the current user owes someone.
 */
export function DebtSummaryCard({ debts, currentUserId, groupId }: DebtSummaryProps) {
  const navigation = useNavigation<Nav>();
  if (debts.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>All settled up!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Balance Summary</Text>
      {debts.map((debt, index) => {
        const isYouOwe = debt.fromUserId === currentUserId;
        const isOwedToYou = debt.toUserId === currentUserId;

        return (
          <View key={index} style={styles.debtRow}>
            {/* From person */}
            <View style={styles.personSection}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: getColorForId(debt.fromUserId) },
                ]}>
                <Text style={styles.avatarText}>
                  {debt.fromName[0].toUpperCase()}
                </Text>
              </View>
              <Text
                style={[styles.name, isYouOwe && styles.nameHighlight]}
                numberOfLines={1}>
                {isYouOwe ? 'You' : debt.fromName}
              </Text>
            </View>

            {/* Arrow and amount */}
            <View style={styles.arrowSection}>
              <Text style={styles.arrow}>→</Text>
              <Text
                style={[
                  styles.debtAmount,
                  isYouOwe ? styles.amountDanger : isOwedToYou ? styles.amountSuccess : {},
                ]}>
                {formatCurrency(debt.amount)}
              </Text>
            </View>

            {/* To person */}
            <View style={styles.personSection}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: getColorForId(debt.toUserId) },
                ]}>
                <Text style={styles.avatarText}>
                  {debt.toName[0].toUpperCase()}
                </Text>
              </View>
              <Text
                style={[styles.name, isOwedToYou && styles.nameHighlight]}
                numberOfLines={1}>
                {isOwedToYou ? 'You' : debt.toName}
              </Text>
            </View>

            {/* Settle button — only shown when YOU owe someone */}
            {isYouOwe && (
              <TouchableOpacity
                style={styles.settleBtn}
                onPress={() =>
                  navigation.navigate('SettleDebt', {
                    groupId,
                    fromUserId: currentUserId,
                    toUserId: debt.toUserId,
                    toName: debt.toName,
                    amount: debt.amount,
                  })
                }>
                <Text style={styles.settleBtnText}>Settle</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    margin: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  header: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.success,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
  },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexWrap: 'wrap',
    gap: 6,
  },
  settleBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  settleBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  personSection: {
    alignItems: 'center',
    width: 70,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  name: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  nameHighlight: {
    fontWeight: '700',
    color: COLORS.text,
  },
  arrowSection: {
    alignItems: 'center',
    flex: 1,
  },
  arrow: {
    fontSize: 18,
    color: COLORS.textLight,
  },
  debtAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 2,
  },
  amountDanger: {
    color: COLORS.danger,
  },
  amountSuccess: {
    color: COLORS.success,
  },
});
