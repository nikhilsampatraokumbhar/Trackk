import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../utils/helpers';
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
}: {
  step: number;
  emoji: string;
  label: string;
  sublabel?: string;
  color: string;
  isLast?: boolean;
}) {
  return (
    <View style={flowStyles.row}>
      {/* Left: step number + connector line */}
      <View style={flowStyles.left}>
        <View style={[flowStyles.stepCircle, { borderColor: color }]}>
          <Text style={[flowStyles.stepNum, { color }]}>{step}</Text>
        </View>
        {!isLast && <View style={[flowStyles.connector, { backgroundColor: `${color}30` }]} />}
      </View>

      {/* Right: content card */}
      <View style={[flowStyles.card, { borderColor: `${color}20` }]}>
        <Text style={flowStyles.emoji}>{emoji}</Text>
        <View style={flowStyles.cardText}>
          <Text style={flowStyles.label}>{label}</Text>
          {sublabel && <Text style={flowStyles.sublabel}>{sublabel}</Text>}
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
    backgroundColor: `${COLORS.background}80`,
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
    backgroundColor: COLORS.glass,
    borderRadius: 14,
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
    color: COLORS.text,
    letterSpacing: 0.1,
  },
  sublabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
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
}: {
  emoji: string;
  label: string;
  sublabel?: string;
  color: string;
}) {
  return (
    <View style={[featureStyles.card, { borderColor: `${color}25` }]}>
      <View style={[featureStyles.iconWrap, { backgroundColor: `${color}15` }]}>
        <Text style={featureStyles.emoji}>{emoji}</Text>
      </View>
      <View style={featureStyles.cardText}>
        <Text style={featureStyles.label}>{label}</Text>
        {sublabel && <Text style={featureStyles.sublabel}>{sublabel}</Text>}
      </View>
    </View>
  );
}

const featureStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass,
    borderRadius: 14,
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
    color: COLORS.text,
    letterSpacing: 0.1,
  },
  sublabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
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

/* ── Slide Definitions ───────────────────────────────────────────── */

const SLIDES = [
  // Slide 1: Welcome / Auto-Track
  {
    gradient: ['#1A1020', '#0A0A0F'] as [string, string],
    badge: null,
    useLogo: true,
    title: 'Track Every Rupee',
    subtitle: 'Zero manual entry. Zero battery drain.',
    accentColor: COLORS.primary,
    steps: [
      { emoji: '📱', label: 'Get an SMS from your bank', sublabel: 'Debits, UPI, card payments' },
      { emoji: '🔔', label: 'Trackk detects it instantly', sublabel: 'No battery drain — native SMS listener' },
      { emoji: '✅', label: 'One tap to add or auto-save', sublabel: 'Review later at end of day' },
      { emoji: '📊', label: 'See where your money goes', sublabel: 'Personal, group, or reimbursement' },
    ],
  },
  // Slide 2: Groups
  {
    gradient: ['#101A18', '#0A0A0F'] as [string, string],
    badge: 'GROUP EXPENSES',
    useLogo: false,
    headerEmoji: '👥',
    title: 'Split With Friends',
    subtitle: 'From trips to everyday expenses.',
    accentColor: COLORS.groupColor,
    steps: [
      { emoji: '➕', label: 'Create a group', sublabel: 'Add members by name & phone' },
      { emoji: '📡', label: 'Start the tracker', sublabel: 'Expenses are auto-detected from SMS' },
      { emoji: '💸', label: 'Split in one tap', sublabel: 'Equal, custom, or with guests' },
      { emoji: '🤝', label: 'Settle via UPI or cash', sublabel: 'One tap — everyone gets notified' },
    ],
  },
  // Slide 3: Goals
  {
    gradient: ['#1A1510', '#0A0A0F'] as [string, string],
    badge: 'SAVINGS GOALS',
    useLogo: false,
    headerEmoji: '🎯',
    title: 'Hit Your Goals',
    subtitle: 'Daily budgets that actually work.',
    accentColor: COLORS.warning,
    steps: [
      { emoji: '🏷️', label: 'Set a savings target', sublabel: 'e.g. ₹1.5L for Spain in 6 months' },
      { emoji: '📅', label: 'Get a daily budget', sublabel: 'Auto-calculated from your income & expenses' },
      { emoji: '🔥', label: 'Build streaks', sublabel: 'Stay under budget, grow your streak' },
      { emoji: '🏦', label: 'Watch your jar grow', sublabel: 'Leftover rolls into your savings jar' },
    ],
  },
  // Slide 4: Subscriptions, EMIs, Investments (individual features, not a flow)
  {
    gradient: ['#101218', '#0A0A0F'] as [string, string],
    badge: 'AUTO-DETECTED',
    useLogo: false,
    headerEmoji: '🔄',
    title: 'Subscriptions, EMIs\n& Investments',
    subtitle: 'All tracked automatically from your SMS.',
    accentColor: COLORS.personalColor,
    isFlow: false,
    features: [
      { emoji: '📺', label: 'Subscriptions', sublabel: 'Netflix, Spotify, YouTube — auto-detected' },
      { emoji: '🏠', label: 'EMIs', sublabel: 'Home, car, personal loans — with countdown' },
      { emoji: '📈', label: 'Investments', sublabel: 'SIPs & mutual funds — amount auto-updates' },
      { emoji: '🔔', label: 'Smart alerts', sublabel: 'Overdue payments, price changes, EMI completion' },
    ],
  },
];

/* ── Main Component ──────────────────────────────────────────────── */

export default function OnboardingScreen({ onComplete }: Props) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<any>(null);

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
    <View style={styles.container}>
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
          <LinearGradient
            key={index}
            colors={slide.gradient}
            style={styles.slide}
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
                <View style={[styles.emojiWrap, { borderColor: `${slide.accentColor}30` }]}>
                  <Text style={styles.headerEmoji}>{(slide as any).headerEmoji}</Text>
                </View>
              )}

              {/* Title & subtitle */}
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.subtitle}>{slide.subtitle}</Text>

              {/* Flow steps or feature cards */}
              <View style={styles.flowContainer}>
                {(slide as any).isFlow === false ? (
                  /* Independent feature cards (no numbering/connectors) */
                  (slide as any).features?.map((item: any, i: number) => (
                    <FeatureCard
                      key={i}
                      emoji={item.emoji}
                      label={item.label}
                      sublabel={item.sublabel}
                      color={slide.accentColor}
                    />
                  ))
                ) : (
                  /* Sequential flow steps */
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
                      />
                    ))}
                    <Text style={[styles.flowFooter, { color: slide.accentColor }]}>
                      Everything in one place
                    </Text>
                  </>
                )}
              </View>
            </View>
          </LinearGradient>
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
                style={[styles.dot, { width: dotWidth, opacity: dotOpacity }]}
              />
            );
          })}
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          {currentSlide < SLIDES.length - 1 ? (
            <>
              <TouchableOpacity onPress={handleSkip} activeOpacity={0.7}>
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.8}>
                <LinearGradient
                  colors={[COLORS.primary, COLORS.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.nextBtnGradient}
                >
                  <Text style={styles.nextBtnText}>Next</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.getStartedBtn} onPress={handleNext} activeOpacity={0.8}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.getStartedBtnGradient}
              >
                <Text style={styles.getStartedBtnText}>Get Started</Text>
              </LinearGradient>
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
    backgroundColor: COLORS.background,
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
    backgroundColor: COLORS.glass,
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
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.primary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  nextBtn: {
    borderRadius: 30,
    overflow: 'hidden',
  },
  nextBtnGradient: {
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 30,
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  getStartedBtn: {
    flex: 1,
    borderRadius: 30,
    overflow: 'hidden',
  },
  getStartedBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 30,
  },
  getStartedBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
