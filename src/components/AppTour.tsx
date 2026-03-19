import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../store/ThemeContext';

const TOUR_KEY = '@et_app_tour_done';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TourStep {
  emoji: string;
  title: string;
  description: string;
  highlight: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    emoji: '💳',
    title: 'Personal Expenses',
    description: 'All your daily spends, tracked automatically from SMS & notifications.',
    highlight: 'Personal tab',
  },
  {
    emoji: '🟢',
    title: 'Active Trackers',
    description: 'Switch on a tracker and forget it — we capture every expense for you.',
    highlight: 'Home screen',
  },
  {
    emoji: '👥',
    title: 'Groups',
    description: 'Split bills with friends, roommates, or travel buddies instantly.',
    highlight: 'Groups tab',
  },
  {
    emoji: '🌙',
    title: 'Review Expenses',
    description: 'Forgot to add something? We collect them here — just tap to add.',
    highlight: 'Home screen',
  },
  {
    emoji: '🎯',
    title: 'Savings Goals',
    description: 'Set a target, get a daily budget, and build a saving streak.',
    highlight: 'Goals screen',
  },
  {
    emoji: '🔄',
    title: 'Subscriptions, Investments & EMIs',
    description: 'Track renewals, SIPs, and loan payments — never miss a due date.',
    highlight: 'Home screen',
  },
  {
    emoji: '🧾',
    title: 'Reimbursements',
    description: 'Log work expenses by trip, attach receipts, and get reimbursed faster.',
    highlight: 'Reimbursement screen',
  },
];

interface AppTourProps {
  visible: boolean;
  onComplete: () => void;
}

export default function AppTour({ visible, onComplete }: AppTourProps) {
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      animateIn();
    }
  }, [visible]);

  useEffect(() => {
    animateIn();
    Animated.timing(progressAnim, {
      toValue: (step + 1) / TOUR_STEPS.length,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [step]);

  const animateIn = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]).start();
  };

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) {
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setStep(step + 1);
      });
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setStep(step - 1);
      });
    }
  };

  const handleComplete = async () => {
    await AsyncStorage.setItem(TOUR_KEY, 'true');
    onComplete();
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(TOUR_KEY, 'true');
    onComplete();
  };

  if (!visible) return null;

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.6)' }]}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.glassBorder,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Skip button */}
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceHigh }]}>
            <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: colors.primary }]} />
          </View>

          {/* Step indicator */}
          <Text style={[styles.stepIndicator, { color: colors.textSecondary }]}>
            {step + 1} of {TOUR_STEPS.length}
          </Text>

          {/* Emoji */}
          <View style={[styles.emojiCircle, { backgroundColor: `${colors.primary}12` }]}>
            <Text style={styles.emoji}>{current.emoji}</Text>
          </View>

          {/* Content */}
          <Text style={[styles.title, { color: colors.text }]}>{current.title}</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>{current.description}</Text>

          {/* Location hint */}
          <View style={[styles.locationBadge, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
            <Text style={[styles.locationText, { color: colors.primary }]}>
              Find it in: {current.highlight}
            </Text>
          </View>

          {/* Navigation */}
          <View style={styles.navRow}>
            {step > 0 ? (
              <TouchableOpacity style={[styles.backBtn, { borderColor: colors.border }]} onPress={handleBack} activeOpacity={0.7}>
                <Text style={[styles.backBtnText, { color: colors.textSecondary }]}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: colors.primary }]}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={styles.nextBtnText}>{isLast ? "Let's Go!" : 'Next'}</Text>
            </TouchableOpacity>
          </View>

          {/* Dots */}
          <View style={styles.dots}>
            {TOUR_STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === step ? colors.primary : colors.surfaceHigher,
                    width: i === step ? 20 : 6,
                  },
                ]}
              />
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export async function shouldShowTour(): Promise<boolean> {
  const done = await AsyncStorage.getItem(TOUR_KEY);
  return done !== 'true';
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: SCREEN_WIDTH - 48,
    borderRadius: 28,
    padding: 28,
    borderWidth: 1,
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  skipBtn: {
    position: 'absolute',
    top: 16,
    right: 20,
    paddingVertical: 4,
    paddingHorizontal: 8,
    zIndex: 10,
  },
  skipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressTrack: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  stepIndicator: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 20,
  },
  emojiCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emoji: {
    fontSize: 36,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  locationBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 28,
  },
  locationText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  navRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginBottom: 20,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
