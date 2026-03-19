import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated,
} from 'react-native';
import { useTheme } from '../store/ThemeContext';
import Logo from '../components/Logo';

const { width } = Dimensions.get('window');

interface Props {
  onComplete: () => void;
}

/* ── Flow Step Component ─────────────────────────────────────────── */

function FlowStep({
  step,
  emoji,
  label,
  sublabel,
  color,
  isLast,
  colors,
}: {
  step: number;
  emoji: string;
  label: string;
  sublabel?: string;
  color: string;
  isLast?: boolean;
  colors: any;
}) {
  return (
    <View style={flowStyles.row}>
      {/* Left: step number + connector line */}
      <View style={flowStyles.left}>
        <View style={[flowStyles.stepCircle, { borderColor: color, backgroundColor: colors.surface }]}>
          <Text style={[flowStyles.stepNum, { color }]}>{step}</Text>
        </View>
        {!isLast && <View style={[flowStyles.connector, { backgroundColor: `${color}30` }]} />}
      </View>

      {/* Right: content card */}
      <View style={[flowStyles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={flowStyles.emoji}>{emoji}</Text>
        <View style={flowStyles.cardText}>
          <Text style={[flowStyles.label, { color: colors.text }]}>{label}</Text>
          {sublabel && <Text style={[flowStyles.sublabel, { color: colors.textSecondary }]}>{sublabel}</Text>}
        </View>
      </View>
    </View>
  );
}

const flowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  left: {
    width: 36,
    alignItems: 'center',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    fontSize: 12,
    fontWeight: '800',
  },
  connector: {
    width: 2,
    flex: 1,
    minHeight: 12,
    borderRadius: 1,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginLeft: 10,
    marginBottom: 8,
  },
  emoji: {
    fontSize: 22,
    marginRight: 10,
  },
  cardText: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  sublabel: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
});

/* ── Feature Card (non-sequential, for slide 4) ─────────────────── */

function FeatureCard({
  emoji,
  label,
  sublabel,
  color,
  colors,
}: {
  emoji: string;
  label: string;
  sublabel?: string;
  color: string;
  colors: any;
}) {
  return (
    <View style={[featureStyles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={[featureStyles.iconWrap, { backgroundColor: `${color}15` }]}>
        <Text style={featureStyles.emoji}>{emoji}</Text>
      </View>
      <View style={featureStyles.cardText}>
        <Text style={[featureStyles.label, { color: colors.text }]}>{label}</Text>
        {sublabel && <Text style={[featureStyles.sublabel, { color: colors.textSecondary }]}>{sublabel}</Text>}
      </View>
    </View>
  );
}

const featureStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  emoji: {
    fontSize: 22,
  },
  cardText: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  sublabel: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
});

/* ── Pill Badge ──────────────────────────────────────────────────── */

function PillBadge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[pillStyles.badge, { backgroundColor: `${color}15`, borderColor: `${color}30` }]}>
      <Text style={[pillStyles.text, { color }]}>{text}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  text: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});

/* ── Main Component ──────────────────────────────────────────────── */

export default function OnboardingScreen({ onComplete }: Props) {
  const { colors } = useTheme();
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<any>(null);

  const SLIDES = [
    {
      badge: null,
      useLogo: true,
      title: 'Track Every Rupee',
      subtitle: 'Zero manual entry. Zero battery drain.',
      accentColor: colors.primary,
      steps: [
        { emoji: '📱', label: 'Make a payment anywhere', sublabel: 'Debits, UPI, card payments' },
        { emoji: '🔔', label: 'Trackk detects it instantly', sublabel: 'Zero battery drain — wakes up only on expense' },
        { emoji: '✅', label: 'One tap to add or auto-save', sublabel: 'Review later at end of day' },
        { emoji: '📊', label: 'See where your money goes', sublabel: 'Personal, group, or reimbursement' },
      ],
    },
    {
      badge: 'GROUP EXPENSES',
      useLogo: false,
      headerEmoji: '👥',
      title: 'Split With Friends',
      subtitle: 'From trips to everyday expenses.',
      accentColor: colors.groupColor,
      steps: [
        { emoji: '➕', label: 'Create a group', sublabel: 'Add members by name & phone' },
        { emoji: '📡', label: 'Start the tracker', sublabel: 'Expenses are auto-detected instantly' },
        { emoji: '💸', label: 'Split in one tap', sublabel: 'Equal, custom, or with guests' },
        { emoji: '🤝', label: 'Settle via UPI or cash', sublabel: 'One tap — everyone gets notified' },
      ],
    },
    {
      badge: 'SAVINGS GOALS',
      useLogo: false,
      headerEmoji: '🎯',
      title: 'Hit Your Goals',
      subtitle: 'Daily budgets that actually work.',
      accentColor: colors.warning,
      steps: [
        { emoji: '🏷️', label: 'Set a savings target', sublabel: 'e.g. ₹1.5L for Spain in 6 months' },
        { emoji: '📅', label: 'Get a daily budget', sublabel: 'Auto-calculated from your income & expenses' },
        { emoji: '🔥', label: 'Build streaks', sublabel: 'Stay under budget, grow your streak' },
        { emoji: '🏦', label: 'Watch your jar grow', sublabel: 'Leftover rolls into your savings jar' },
      ],
    },
    {
      badge: 'AUTO-DETECTED',
      useLogo: false,
      headerEmoji: '🔄',
      title: 'Subscriptions, EMIs\n& Investments',
      subtitle: 'All tracked automatically for you.',
      accentColor: colors.personalColor,
      isFlow: false,
      features: [
        { emoji: '📺', label: 'Subscriptions', sublabel: 'Netflix, Spotify, YouTube — auto-detected' },
        { emoji: '🏠', label: 'EMIs', sublabel: 'Home, car, personal loans — with countdown' },
        { emoji: '📈', label: 'Investments', sublabel: 'SIPs & mutual funds — amount auto-updates' },
        { emoji: '🔔', label: 'Smart alerts', sublabel: 'Overdue payments, price changes, EMI completion' },
      ],
    },
  ];

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      const next = currentSlide + 1;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setCurrentSlide(next);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onMomentumScrollEnd={(e: any) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentSlide(idx);
        }}
      >
        {SLIDES.map((slide, index) => (
          <View
            key={index}
            style={[styles.slide, { backgroundColor: colors.background }]}
          >
            <View style={styles.slideContent}>
              {/* Badge */}
              {slide.badge && (
                <PillBadge text={slide.badge} color={slide.accentColor} />
              )}

              {/* Header: Logo or emoji */}
              {slide.useLogo ? (
                <View style={styles.logoWrap}>
                  <Logo size={64} />
                </View>
              ) : (
                <View style={[styles.emojiWrap, { borderColor: `${slide.accentColor}30`, backgroundColor: colors.surface }]}>
                  <Text style={styles.headerEmoji}>{(slide as any).headerEmoji}</Text>
                </View>
              )}

              {/* Title & subtitle */}
              <Text style={[styles.title, { color: colors.text }]}>{slide.title}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{slide.subtitle}</Text>

              {/* Flow steps or feature cards */}
              <View style={styles.flowContainer}>
                {(slide as any).isFlow === false ? (
                  (slide as any).features?.map((item: any, i: number) => (
                    <FeatureCard
                      key={i}
                      emoji={item.emoji}
                      label={item.label}
                      sublabel={item.sublabel}
                      color={slide.accentColor}
                      colors={colors}
                    />
                  ))
                ) : (
                  <>
                    {slide.steps?.map((step, i) => (
                      <FlowStep
                        key={i}
                        step={i + 1}
                        emoji={step.emoji}
                        label={step.label}
                        sublabel={step.sublabel}
                        color={slide.accentColor}
                        isLast={i === slide.steps.length - 1}
                        colors={colors}
                      />
                    ))}
                    <Text style={[styles.flowFooter, { color: slide.accentColor }]}>
                      Everything in one place
                    </Text>
                  </>
                )}
              </View>
            </View>
          </View>
        ))}
      </Animated.ScrollView>

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, index) => {
            const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={index}
                style={[styles.dot, { width: dotWidth, opacity: dotOpacity, backgroundColor: colors.primary }]}
              />
            );
          })}
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          {currentSlide < SLIDES.length - 1 ? (
            <>
              <TouchableOpacity onPress={handleSkip} activeOpacity={0.7}>
                <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                onPress={handleNext}
                activeOpacity={0.8}
              >
                <Text style={styles.nextBtnText}>Next</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.getStartedBtn, { backgroundColor: colors.primary }]}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={styles.getStartedBtnText}>Get Started</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slide: {
    width,
    flex: 1,
  },
  slideContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 140,
    paddingTop: 60,
  },
  logoWrap: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  emojiWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  headerEmoji: {
    fontSize: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: 0.2,
    marginBottom: 28,
  },

  /* ── Flow Container ──────────────────────────────────────────── */
  flowContainer: {
    paddingLeft: 4,
  },
  flowFooter: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: 0.5,
    opacity: 0.7,
  },

  /* ── Bottom Bar ──────────────────────────────────────────────── */
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 50,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  nextBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 36,
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  getStartedBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  getStartedBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
