import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';
import { COLORS } from '../utils/helpers';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

function SkeletonBox({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: COLORS.surfaceHigh,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

/** Skeleton that mimics a transaction card */
export function TransactionCardSkeleton() {
  return (
    <View style={styles.txnCard}>
      <SkeletonBox width={46} height={46} borderRadius={14} />
      <View style={styles.txnContent}>
        <SkeletonBox width="65%" height={14} />
        <SkeletonBox width="40%" height={10} style={{ marginTop: 8 }} />
      </View>
      <SkeletonBox width={60} height={16} borderRadius={6} />
    </View>
  );
}

/** Skeleton that mimics a hero stats card */
export function HeroCardSkeleton() {
  return (
    <View style={styles.heroCard}>
      <SkeletonBox width={80} height={10} style={{ marginBottom: 12 }} />
      <SkeletonBox width={160} height={36} borderRadius={10} />
      <SkeletonBox width={120} height={10} style={{ marginTop: 10 }} />
    </View>
  );
}

/** Skeleton list of transaction cards */
export function TransactionListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <TransactionCardSkeleton key={i} />
      ))}
    </View>
  );
}

export default SkeletonBox;

const styles = StyleSheet.create({
  txnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass,
    borderRadius: 20,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  txnContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
  },
  heroCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
});
