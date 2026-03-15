import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle, Dimensions } from 'react-native';
import { COLORS } from '../utils/helpers';
import { pulseLoop } from '../utils/motion';
import { RADIUS, SPACING } from '../utils/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

function SkeletonBox({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = pulseLoop(pulse);
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

// ─── Transaction Card Skeleton ───────────────────────────────────────────────

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

// ─── Hero Card Skeleton ──────────────────────────────────────────────────────

export function HeroCardSkeleton() {
  return (
    <View style={styles.heroCard}>
      <SkeletonBox width={80} height={10} style={{ marginBottom: 12 }} />
      <SkeletonBox width={160} height={36} borderRadius={10} />
      <SkeletonBox width={120} height={10} style={{ marginTop: 10 }} />
    </View>
  );
}

// ─── Transaction List Skeleton ───────────────────────────────────────────────

export function TransactionListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <TransactionCardSkeleton key={i} />
      ))}
    </View>
  );
}

// ─── Home Screen Skeleton ────────────────────────────────────────────────────
// Mimics: hero stats card + tracker banner + 3 transaction cards

export function HomeScreenSkeleton() {
  return (
    <View style={styles.screenContainer}>
      {/* Hero stats */}
      <View style={styles.homeHero}>
        <SkeletonBox width={100} height={10} style={{ marginBottom: 14 }} />
        <SkeletonBox width={180} height={40} borderRadius={10} />
        <SkeletonBox width={140} height={10} style={{ marginTop: 12 }} />
        <View style={styles.homeStatRow}>
          <SkeletonBox width="45%" height={48} borderRadius={12} />
          <SkeletonBox width="45%" height={48} borderRadius={12} />
        </View>
      </View>

      {/* Section label */}
      <SkeletonBox width={120} height={10} style={{ marginBottom: 12, marginTop: 20 }} />

      {/* Transaction list */}
      <TransactionCardSkeleton />
      <TransactionCardSkeleton />
      <TransactionCardSkeleton />
    </View>
  );
}

// ─── Goals Screen Skeleton ───────────────────────────────────────────────────
// Mimics: goal card with progress ring + daily budget

export function GoalsSkeleton() {
  return (
    <View style={styles.screenContainer}>
      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <SkeletonBox width={50} height={50} borderRadius={25} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <SkeletonBox width="60%" height={16} />
            <SkeletonBox width="40%" height={10} style={{ marginTop: 8 }} />
          </View>
          <SkeletonBox width={70} height={28} borderRadius={8} />
        </View>
        {/* Progress bar */}
        <SkeletonBox width="100%" height={6} borderRadius={3} style={{ marginTop: 16 }} />
        {/* Stats row */}
        <View style={styles.goalStatsRow}>
          <SkeletonBox width="30%" height={40} borderRadius={10} />
          <SkeletonBox width="30%" height={40} borderRadius={10} />
          <SkeletonBox width="30%" height={40} borderRadius={10} />
        </View>
      </View>
    </View>
  );
}

// ─── Group List Skeleton ─────────────────────────────────────────────────────

export function GroupListSkeleton() {
  return (
    <View style={styles.screenContainer}>
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} style={styles.groupCard}>
          <View style={styles.groupRow}>
            <SkeletonBox width={48} height={48} borderRadius={16} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <SkeletonBox width="55%" height={16} />
              <SkeletonBox width="35%" height={10} style={{ marginTop: 8 }} />
            </View>
            <SkeletonBox width={60} height={20} borderRadius={6} />
          </View>
          {/* Member avatars */}
          <View style={styles.groupAvatars}>
            {Array.from({ length: 4 }).map((_, j) => (
              <SkeletonBox key={j} width={28} height={28} borderRadius={14} style={{ marginRight: -6 }} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Insights Screen Skeleton ────────────────────────────────────────────────

export function InsightsSkeleton() {
  return (
    <View style={styles.screenContainer}>
      {/* Period selector */}
      <View style={styles.insightsTabs}>
        <SkeletonBox width="30%" height={36} borderRadius={10} />
        <SkeletonBox width="30%" height={36} borderRadius={10} />
        <SkeletonBox width="30%" height={36} borderRadius={10} />
      </View>

      {/* Summary card */}
      <View style={styles.insightsSummary}>
        <SkeletonBox width={100} height={10} style={{ marginBottom: 10 }} />
        <SkeletonBox width={160} height={32} borderRadius={8} />
      </View>

      {/* Category bars */}
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={styles.insightsCatRow}>
          <SkeletonBox width={32} height={32} borderRadius={10} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <SkeletonBox width={`${80 - i * 12}%`} height={8} borderRadius={4} />
            <SkeletonBox width="40%" height={10} style={{ marginTop: 6 }} />
          </View>
          <SkeletonBox width={50} height={14} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

// ─── Subscriptions / EMIs / Investments Skeleton ─────────────────────────────

export function ListItemSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.screenContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.listItem}>
          <SkeletonBox width={42} height={42} borderRadius={12} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <SkeletonBox width="55%" height={14} />
            <SkeletonBox width="35%" height={10} style={{ marginTop: 6 }} />
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <SkeletonBox width={55} height={14} borderRadius={4} />
            <SkeletonBox width={35} height={10} borderRadius={4} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default SkeletonBox;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Shared
  screenContainer: {
    padding: SPACING.xl,
  },

  // Transaction card
  txnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass,
    borderRadius: RADIUS.card,
    padding: SPACING.xl,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  txnContent: {
    flex: 1,
    marginLeft: SPACING.lg,
    marginRight: SPACING.lg,
  },

  // Hero card
  heroCard: {
    backgroundColor: COLORS.glass,
    borderRadius: RADIUS.sheet,
    padding: SPACING._24,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },

  // Home screen
  homeHero: {
    backgroundColor: COLORS.glass,
    borderRadius: RADIUS.card,
    padding: SPACING._24,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    marginBottom: SPACING.md,
  },
  homeStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xl,
    gap: SPACING.lg,
  },

  // Goals
  goalCard: {
    backgroundColor: COLORS.glass,
    borderRadius: RADIUS.card,
    padding: SPACING.xxl,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xl,
    gap: SPACING.md,
  },

  // Group list
  groupCard: {
    backgroundColor: COLORS.glass,
    borderRadius: RADIUS.card,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupAvatars: {
    flexDirection: 'row',
    marginTop: SPACING.lg,
    paddingLeft: 4,
  },

  // Insights
  insightsTabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  insightsSummary: {
    backgroundColor: COLORS.glass,
    borderRadius: RADIUS.card,
    padding: SPACING.xxl,
    marginBottom: SPACING.xxl,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  insightsCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },

  // Generic list items (subscriptions, emis, investments)
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass,
    borderRadius: RADIUS.xl,
    padding: SPACING._14,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
