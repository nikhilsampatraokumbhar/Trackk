import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { COLORS } from '../utils/helpers';
import { TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../utils/theme';
import { SPRING, DURATION, EASING, fadeIn } from '../utils/motion';
import { hapticMedium } from '../utils/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface PremiumGateProps {
  visible: boolean;
  onClose: () => void;
  feature: string;
  description: string;
}

const CLEVER_NUDGES = [
  'Upgrade for less than your morning chai',
  'Premium pays for itself in week one',
  'Your wallet will thank you later',
  'Smart money moves start here',
];

export default function PremiumGate({ visible, onClose, feature, description }: PremiumGateProps) {
  const nav = useNavigation<Nav>();
  const nudge = CLEVER_NUDGES[Math.floor(Math.random() * CLEVER_NUDGES.length)];

  // Animation values
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset
      backdropOpacity.setValue(0);
      cardScale.setValue(0.85);
      cardOpacity.setValue(0);
      iconScale.setValue(0);
      contentOpacity.setValue(0);

      hapticMedium();

      Animated.sequence([
        // Backdrop fade
        Animated.timing(backdropOpacity, {
          toValue: 1, duration: DURATION.fast, useNativeDriver: true,
        }),
        // Card springs in
        Animated.parallel([
          Animated.spring(cardScale, { toValue: 1, ...SPRING.responsive }),
          fadeIn(cardOpacity, DURATION.normal),
        ]),
        // Lock icon pops
        Animated.spring(iconScale, { toValue: 1, ...SPRING.bouncy }),
        // Content fades in
        fadeIn(contentOpacity, DURATION.fast),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0, duration: DURATION.fast, useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0, duration: DURATION.fast, useNativeDriver: true,
      }),
      Animated.timing(cardScale, {
        toValue: 0.9, duration: DURATION.fast, useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />

        <Animated.View style={[
          styles.content,
          { opacity: cardOpacity, transform: [{ scale: cardScale }] },
        ]}>
          {/* Top accent line */}
          <View style={styles.accentLine} />

          {/* Lock icon with ring */}
          <Animated.View style={[styles.iconRing, { transform: [{ scale: iconScale }] }]}>
            <Text style={styles.lockIcon}>🔒</Text>
          </Animated.View>

          <Animated.View style={{ opacity: contentOpacity, alignItems: 'center', width: '100%' }}>
            <Text style={styles.title}>{feature}</Text>
            <Text style={styles.description}>{description}</Text>

            <View style={styles.divider} />

            {/* Nudge with sparkle */}
            <View style={styles.nudgeRow}>
              <Text style={styles.nudgeIcon}>✨</Text>
              <Text style={styles.nudge}>{nudge}</Text>
            </View>

            <TouchableOpacity
              style={styles.upgradeBtn}
              onPress={() => {
                handleClose();
                setTimeout(() => nav.navigate('Pricing' as any), 300);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.upgradeBtnText}>See Premium Plans</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.laterBtn} onPress={handleClose}>
              <Text style={styles.laterBtnText}>Maybe Later</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING._24,
  },
  content: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sheet,
    padding: SPACING._28,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    overflow: 'hidden',
    ...SHADOWS.heavy,
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: COLORS.primary,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${COLORS.primary}12`,
    borderWidth: 2,
    borderColor: `${COLORS.primary}30`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  lockIcon: { fontSize: 32 },
  title: {
    ...TYPOGRAPHY.title,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  description: {
    ...TYPOGRAPHY.bodySm,
    textAlign: 'center',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    width: '100%',
    marginVertical: SPACING.xxl,
  },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  nudgeIcon: { fontSize: 16 },
  nudge: {
    fontSize: 14,
    color: COLORS.primaryLight,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  upgradeBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING._32,
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING._10,
    ...SHADOWS.glow,
  },
  upgradeBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.background,
  },
  laterBtn: {
    paddingVertical: SPACING.lg,
  },
  laterBtnText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
});
