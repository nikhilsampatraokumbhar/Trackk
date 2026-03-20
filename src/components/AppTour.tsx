import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../store/ThemeContext';
import { useTour, ElementRect } from '../store/TourContext';

const TOUR_KEY = '@et_app_tour_done';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SPOTLIGHT_PADDING = 8;
const TOOLTIP_MARGIN = 12;

interface TourStep {
  emoji: string;
  title: string;
  description: string;
  highlight: string;
  spotlightKey?: string; // Key registered via TourContext — if set, spotlight mode is used
}

const TOUR_STEPS: TourStep[] = [
  {
    emoji: '💳',
    title: 'Personal Expenses',
    description: 'All your daily spends, tracked automatically from SMS & notifications.',
    highlight: 'Personal tab (bottom bar)',
  },
  {
    emoji: '🟢',
    title: 'Active Trackers',
    description: 'Pick up to 3 trackers — Personal, Group, or Reimbursement. Each gets its own button in the notification.',
    highlight: 'Home screen (top section)',
    spotlightKey: 'activeTrackers',
  },
  {
    emoji: '⏸️',
    title: 'Pause Tracking',
    description: 'Toggle this switch to pause all tracking without losing your slot selections. Turn it back on to resume instantly.',
    highlight: 'Home screen (tracker toggle)',
    spotlightKey: 'trackingToggle',
  },
  {
    emoji: '👥',
    title: 'Groups',
    description: 'Split bills with friends, roommates, or travel buddies instantly.',
    highlight: 'Groups tab (bottom bar)',
  },
  {
    emoji: '🌙',
    title: 'Review Expenses',
    description: 'Forgot to add something? We collect them here — just tap to add.',
    highlight: 'Home screen (below trackers)',
    spotlightKey: 'reviewExpenses',
  },
  {
    emoji: '🎯',
    title: 'Savings Goals',
    description: 'Set a target, get a daily budget, and build a saving streak.',
    highlight: 'Home > Today\'s Jar card',
  },
  {
    emoji: '🔄',
    title: 'Subscriptions, Investments & EMIs',
    description: 'Track renewals, SIPs, and loan payments — everything in one place.',
    highlight: 'Home screen (scroll down)',
  },
  {
    emoji: '🧾',
    title: 'Reimbursements',
    description: 'Log work expenses by trip, attach receipts, download everything once done.',
    highlight: 'Reimbursement screen',
  },
];

interface AppTourProps {
  visible: boolean;
  onComplete: () => void;
}

export default function AppTour({ visible, onComplete }: AppTourProps) {
  const { colors, isDark } = useTheme();
  const { measureElement } = useTour();
  const [step, setStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<ElementRect | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      animateIn();
      measureCurrentStep(0);
    }
  }, [visible]);

  useEffect(() => {
    animateIn();
    measureCurrentStep(step);
    Animated.timing(progressAnim, {
      toValue: (step + 1) / TOUR_STEPS.length,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [step]);

  const measureCurrentStep = useCallback(async (idx: number) => {
    const currentStep = TOUR_STEPS[idx];
    if (currentStep.spotlightKey) {
      // Small delay to let layout settle after step transition
      setTimeout(async () => {
        const rect = await measureElement(currentStep.spotlightKey!);
        setSpotlightRect(rect);
      }, 100);
    } else {
      setSpotlightRect(null);
    }
  }, [measureElement]);

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
  const hasSpotlight = !!spotlightRect && !!current.spotlightKey;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Calculate tooltip position when spotlight is active
  const tooltipPosition = hasSpotlight ? getTooltipPosition(spotlightRect!) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.fullOverlay}>
        {/* Dark overlay with spotlight cutout */}
        {hasSpotlight ? (
          <>
            {/* Four dark rectangles around the spotlight hole */}
            <View style={[styles.overlayPart, { top: 0, left: 0, right: 0, height: spotlightRect!.y - SPOTLIGHT_PADDING }, { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.6)' }]} />
            <View style={[styles.overlayPart, { top: spotlightRect!.y - SPOTLIGHT_PADDING, left: 0, width: spotlightRect!.x - SPOTLIGHT_PADDING, height: spotlightRect!.height + SPOTLIGHT_PADDING * 2 }, { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.6)' }]} />
            <View style={[styles.overlayPart, { top: spotlightRect!.y - SPOTLIGHT_PADDING, left: spotlightRect!.x + spotlightRect!.width + SPOTLIGHT_PADDING, right: 0, height: spotlightRect!.height + SPOTLIGHT_PADDING * 2 }, { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.6)' }]} />
            <View style={[styles.overlayPart, { top: spotlightRect!.y + spotlightRect!.height + SPOTLIGHT_PADDING, left: 0, right: 0, bottom: 0 }, { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.6)' }]} />

            {/* Spotlight ring around the element */}
            <View style={[styles.spotlightRing, {
              top: spotlightRect!.y - SPOTLIGHT_PADDING,
              left: spotlightRect!.x - SPOTLIGHT_PADDING,
              width: spotlightRect!.width + SPOTLIGHT_PADDING * 2,
              height: spotlightRect!.height + SPOTLIGHT_PADDING * 2,
              borderColor: colors.primary,
            }]} />

            {/* Arrow pointing from tooltip to spotlight */}
            <View style={[
              styles.arrow,
              tooltipPosition!.arrowOnTop
                ? {
                    top: spotlightRect!.y - SPOTLIGHT_PADDING - 10,
                    left: spotlightRect!.x + spotlightRect!.width / 2 - 8,
                    borderBottomColor: colors.surface,
                  }
                : {
                    top: spotlightRect!.y + spotlightRect!.height + SPOTLIGHT_PADDING,
                    left: spotlightRect!.x + spotlightRect!.width / 2 - 8,
                    borderTopColor: colors.surface,
                  },
            ]} />
          </>
        ) : (
          <View style={[styles.fullOverlayBg, { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.5)' }]} />
        )}

        {/* Tooltip / Card */}
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
            hasSpotlight && tooltipPosition && {
              position: 'absolute',
              top: tooltipPosition.top,
              left: tooltipPosition.left,
              width: tooltipPosition.width,
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

          {/* Location hint — only when not in spotlight mode */}
          {!hasSpotlight && (
            <View style={[styles.locationBadge, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
              <Text style={[styles.locationText, { color: colors.primary }]}>
                Find it in: {current.highlight}
              </Text>
            </View>
          )}

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

/**
 * Calculate where to position the tooltip relative to the spotlight.
 * Prefers placing below the element; if not enough space, places above.
 */
function getTooltipPosition(rect: ElementRect): {
  top: number;
  left: number;
  width: number;
  arrowOnTop: boolean;
} {
  const cardWidth = SCREEN_WIDTH - 48;
  const estimatedCardHeight = 340;
  const left = Math.max(16, (SCREEN_WIDTH - cardWidth) / 2);

  const spaceBelow = SCREEN_HEIGHT - (rect.y + rect.height + SPOTLIGHT_PADDING + TOOLTIP_MARGIN);
  const spaceAbove = rect.y - SPOTLIGHT_PADDING - TOOLTIP_MARGIN;

  if (spaceBelow >= estimatedCardHeight) {
    return {
      top: rect.y + rect.height + SPOTLIGHT_PADDING + TOOLTIP_MARGIN,
      left,
      width: cardWidth,
      arrowOnTop: false,
    };
  } else {
    return {
      top: Math.max(16, rect.y - SPOTLIGHT_PADDING - TOOLTIP_MARGIN - estimatedCardHeight),
      left,
      width: cardWidth,
      arrowOnTop: true,
    };
  }
}

export async function shouldShowTour(): Promise<boolean> {
  const done = await AsyncStorage.getItem(TOUR_KEY);
  return done !== 'true';
}

const styles = StyleSheet.create({
  fullOverlay: {
    flex: 1,
  },
  fullOverlayBg: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayPart: {
    position: 'absolute',
  },
  spotlightRing: {
    position: 'absolute',
    borderRadius: 12,
    borderWidth: 2,
  },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  card: {
    width: SCREEN_WIDTH - 48,
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    alignItems: 'center',
    alignSelf: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
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
    fontWeight: '600',
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
    fontWeight: '700',
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
    fontWeight: '600',
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
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: '600',
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
