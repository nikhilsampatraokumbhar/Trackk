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

const SWIPE_THRESHOLD = -80;

function TransactionCardInner({ transaction, onPress, onLongPress, onSwipeDelete, showBadge }: Props) {
  const color = TRACKER_COLORS[transaction.trackerType] || COLORS.primary;
  const initial = (transaction.merchant || transaction.description)[0].toUpperCase();
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
          {/* Icon */}
          <View style={[styles.icon, { backgroundColor: `${color}15` }]}>
            <Text style={[styles.iconText, { color }]}>{initial}</Text>
          </View>

          {/* Info */}
          <View style={styles.info}>
            <Text style={styles.desc} numberOfLines={1}>{transaction.description}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.date}>{formatDate(transaction.timestamp)}</Text>
              {transaction.category ? (
                <View style={styles.categoryChip}>
                  <Text style={styles.categoryText}>{transaction.category}</Text>
                </View>
              ) : null}
            </View>
            {transaction.note ? (
              <Text style={styles.note} numberOfLines={1}>{transaction.note}</Text>
            ) : null}
            {transaction.tags && transaction.tags.length > 0 && (
              <View style={styles.tagRow}>
                {transaction.tags.slice(0, 3).map(tag => (
                  <View key={tag} style={styles.tagChip}>
                    <Text style={styles.tagChipText}>{tag}</Text>
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
              <View style={[styles.badge, { backgroundColor: `${color}12` }]}>
                <Text style={[styles.badgeText, { color }]}>
                  {TRACKER_LABELS[transaction.trackerType] || transaction.trackerType}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  deleteBg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    left: 0,
    backgroundColor: COLORS.danger,
    borderRadius: 20,
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
    padding: 16,
    backgroundColor: COLORS.glass,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconText: { fontSize: 18, fontWeight: '800' },
  info: { flex: 1 },
  desc: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  date: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  categoryChip: {
    backgroundColor: COLORS.glassHigh,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  categoryText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textSecondary,
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
    marginTop: 6,
    alignItems: 'center',
  },
  tagChip: {
    backgroundColor: COLORS.glassHigh,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagChipText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tagMore: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  right: { alignItems: 'flex-end', gap: 6 },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

const TransactionCard = memo(TransactionCardInner);
export default TransactionCard;
