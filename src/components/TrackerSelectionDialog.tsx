import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Surface, Divider } from 'react-native-paper';
import { ActiveTracker, ParsedTransaction } from '../models/types';
import { formatCurrency } from '../utils/helpers';
import { useTheme } from '../store/ThemeContext';

interface Props {
  visible: boolean;
  transaction: ParsedTransaction | null;
  trackers: ActiveTracker[];
  onSelect: (tracker: ActiveTracker) => void;
  onIgnore: () => void;
}

export default function TrackerSelectionDialog({
  visible, transaction, trackers, onSelect, onIgnore,
}: Props) {
  const { colors } = useTheme();

  if (!transaction) return null;

  const TRACKER_META: Record<string, { color: string; icon: string; desc: string }> = {
    personal:      { color: colors.personalColor,      icon: '💳', desc: 'Your personal expenses' },
    reimbursement: { color: colors.reimbursementColor, icon: '🧾', desc: 'Office / business' },
    group:         { color: colors.groupColor,         icon: '👥', desc: 'Split with group' },
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.sheet, {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        }]}>
          {/* Handle bar */}
          <View style={[styles.handle, { backgroundColor: colors.surfaceHigher }]} />

          {/* Amount display */}
          <View style={[styles.amountCard, {
            backgroundColor: colors.surfaceHigh,
            borderColor: colors.border,
          }]}>
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Amount Debited</Text>
            <Text style={[styles.amount, { color: colors.primary }]}>{formatCurrency(transaction.amount)}</Text>
            <Text style={[styles.merchant, { color: colors.textSecondary }]} numberOfLines={1}>
              {transaction.merchant || transaction.bank || 'Bank transaction'}
            </Text>
          </View>

          <Text style={[styles.question, { color: colors.textSecondary }]}>Where should this go?</Text>

          {/* Tracker options */}
          {trackers.map(tracker => {
            const meta = TRACKER_META[tracker.type] || TRACKER_META.personal;
            return (
              <TouchableOpacity
                key={tracker.id}
                style={[styles.option, {
                  backgroundColor: colors.surfaceHigh,
                  borderColor: colors.border,
                }]}
                onPress={() => onSelect(tracker)}
                activeOpacity={0.7}
              >
                <View style={[styles.optionAccent, { backgroundColor: meta.color }]} />
                <View style={[styles.optionIconWrap, { backgroundColor: `${meta.color}15` }]}>
                  <Text style={styles.optionIcon}>{meta.icon}</Text>
                </View>
                <View style={styles.optionInfo}>
                  <Text style={[styles.optionLabel, { color: colors.text }]}>{tracker.label}</Text>
                  <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>{meta.desc}</Text>
                </View>
                <View style={[styles.optionArrow, { borderColor: meta.color }]}>
                  <Text style={[styles.optionArrowText, { color: meta.color }]}>→</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Ignore */}
          <TouchableOpacity style={styles.ignoreBtn} onPress={onIgnore} activeOpacity={0.6}>
            <Text style={[styles.ignoreText, { color: colors.textSecondary }]}>Ignore this transaction</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 44,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  amountCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
  },
  amountLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  amount: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  merchant: {
    fontSize: 13,
    marginTop: 4,
  },
  question: {
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
  },
  optionAccent: {
    width: 4,
    alignSelf: 'stretch',
  },
  optionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 12,
  },
  optionIcon: { fontSize: 20 },
  optionInfo: { flex: 1, paddingVertical: 14 },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  optionArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  optionArrowText: { fontSize: 16, fontWeight: '600' },
  ignoreBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 4,
  },
  ignoreText: {
    fontSize: 14,
  },
});
