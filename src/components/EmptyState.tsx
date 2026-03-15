import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { COLORS } from '../utils/helpers';
import { TYPOGRAPHY, SPACING, RADIUS } from '../utils/theme';
import { SPRING, DURATION, EASING, fadeIn } from '../utils/motion';

interface EmptyStateProps {
  /** Emoji displayed prominently */
  icon: string;
  /** Main heading */
  title: string;
  /** Supporting description */
  subtitle?: string;
  /** Optional call-to-action button */
  actionLabel?: string;
  /** Called when CTA is pressed */
  onAction?: () => void;
  /** Accent color for the icon ring and CTA (defaults to primary) */
  accent?: string;
}

/**
 * Unified empty state component with entrance animation.
 * Replaces the ad-hoc empty Views scattered across screens.
 */
export default function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  accent = COLORS.primary,
}: EmptyStateProps) {
  const iconScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.sequence([
      // Icon pops in
      Animated.spring(iconScale, { toValue: 1, ...SPRING.bouncy }),
      // Text slides up + fades in
      Animated.parallel([
        fadeIn(contentOpacity, DURATION.normal),
        Animated.spring(contentTranslateY, { toValue: 0, ...SPRING.gentle }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Icon with colored ring */}
      <Animated.View
        style={[
          styles.iconRing,
          {
            backgroundColor: `${accent}10`,
            borderColor: `${accent}25`,
            transform: [{ scale: iconScale }],
          },
        ]}
      >
        <Text style={styles.icon}>{icon}</Text>
      </Animated.View>

      {/* Text content */}
      <Animated.View
        style={{
          opacity: contentOpacity,
          transform: [{ translateY: contentTranslateY }],
          alignItems: 'center',
        }}
      >
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        {actionLabel && onAction && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: accent }]}
            onPress={onAction}
            activeOpacity={0.8}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING._48,
    paddingHorizontal: SPACING._24,
  },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xxl,
  },
  icon: {
    fontSize: 36,
  },
  title: {
    ...TYPOGRAPHY.titleSm,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySm,
    textAlign: 'center',
    maxWidth: 280,
  },
  actionBtn: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING._24,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.background,
    letterSpacing: 0.3,
  },
});
