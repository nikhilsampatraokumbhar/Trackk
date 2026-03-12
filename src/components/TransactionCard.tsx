import React, { memo, useRef } from 'react';
import {
  TouchableOpacity, Text, StyleSheet, View, Animated, PanResponder, Vibration,
} from 'react-native';
import { Transaction } from '../models/types';
import { formatCurrency, formatDate, COLORS } from '../utils/helpers';

interface Props {
  transaction: Transaction;
  onPress?: () => void;
  onLongPress?: () => void;
  onSwipeDelete?: () => void;
  showBadge?: boolean;
}

const TRACKER_LABELS: Record<string, string> = {
  personal: 'Personal',
  reimbursement: 'Reimburse',
  group: 'Group',
};

const TRACKER_COLORS: Record<string, string> = {
  personal: COLORS.personalColor,
  reimbursement: COLORS.reimbursementColor,
  group: COLORS.groupColor,
};

const SWIPE_THRESHOLD = -80;

function TransactionCardInner({ transaction, onPress, onLongPress, onSwipeDelete, showBadge }: Props) {
  const color = TRACKER_COLORS[transaction.trackerType] || COLORS.textSecondary;
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    onSwipeDelete
      ? PanResponder.create({
          onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy),
          onPanResponderMove: (_, gs) => {
            if (gs.dx < 0) translateX.setValue(gs.dx);
          },
          onPanResponderRelease: (_, gs) => {
            if (gs.dx < SWIPE_THRESHOLD) {
              Vibration.vibrate(30);
              Animated.timing(translateX, { toValue: -400, duration: 200, useNativeDriver: true }).start(() => {
                onSwipeDelete();
              });
            } else {
              Animated.spring(translateX, { toValue: 0, friction: 8, useNativeDriver: true }).start();
            }
          },
          onPanResponderTerminate: () => {
            Animated.spring(translateX, { toValue: 0, friction: 8, useNativeDriver: true }).start();
          },
        })
      : PanResponder.create({})
  ).current;

  return (
    <View style={styles.swipeContainer}>
      {/* Delete background */}
      {onSwipeDelete && (
        <View style={styles.deleteBg}>
          <Text style={styles.deleteLabel}>Delete</Text>
        </View>
      )}

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.card}
          onPress={onPress}
          onLongPress={() => {
            if (onLongPress) {
              Vibration.vibrate(30);
              onLongPress();
            }
          }}
          delayLongPress={400}
          activeOpacity={0.7}
        >
          {/* Info — no icon, cleaner layout */}
          <View style={styles.info}>
            <Text style={styles.desc} numberOfLines={1}>{transaction.description}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.date}>{formatDate(transaction.timestamp)}</Text>
              {transaction.category ? (
                <View style={styles.categoryChip}>
                  <Text style={styles.categoryText}>{transaction.category}</Text>
                </View>
              ) : null}
              {showBadge && (
                <View style={[styles.badge, { backgroundColor: `${color}12` }]}>
                  <Text style={[styles.badgeText, { color }]}>
                    {TRACKER_LABELS[transaction.trackerType] || transaction.trackerType}
                  </Text>
                </View>
              )}
            </View>
            {transaction.note ? (
              <Text style={styles.note} numberOfLines={1}>{transaction.note}</Text>
            ) : null}
          </View>

          {/* Right side — amount */}
          <Text style={styles.amount}>-{formatCurrency(transaction.amount)}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    position: 'relative',
    marginBottom: 2,
  },
  deleteBg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    left: 0,
    backgroundColor: COLORS.danger,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 24,
  },
  deleteLabel: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  info: { flex: 1 },
  desc: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  date: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  categoryChip: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  note: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 3,
    fontStyle: 'italic',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginLeft: 12,
  },
});

const TransactionCard = memo(TransactionCardInner);
export default TransactionCard;
