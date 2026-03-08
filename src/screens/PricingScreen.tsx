import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Animated, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { usePremium, PLANS, FOUNDING_PRICES } from '../store/PremiumContext';
import { PlanId } from '../models/types';
import { COLORS, formatCurrency } from '../utils/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const { width } = Dimensions.get('window');

// Clever taglines for the hero section
const HERO_LINES = [
  'Your money deserves a better memory than you',
  'Because "I\'ll remember it later" never works',
  'Track every rupee. Even the ones you wish you hadn\'t spent.',
];

export default function PricingScreen() {
  const nav = useNavigation<Nav>();
  const { subscription, isPremium, activatePromoCode, subscribeToPlan } = usePremium();
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'individual' | 'family'>('individual');
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const switchTab = (tab: 'individual' | 'family') => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setSelectedTab(tab);
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  };

  const handlePromoCode = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    const result = await activatePromoCode(promoCode);
    setPromoLoading(false);
    Alert.alert(result.success ? 'Activated!' : 'Oops', result.message);
    if (result.success) setPromoCode('');
  };

  const handleSubscribe = async (planId: PlanId) => {
    if (planId === 'free') return;

    // In production, this opens Razorpay checkout
    Alert.alert(
      'Confirm Subscription',
      `Subscribe to ${PLANS[planId].name} for ${formatCurrency(FOUNDING_PRICES[planId] || PLANS[planId].price)}${PLANS[planId].period === 'monthly' ? '/month' : PLANS[planId].period === 'annual' ? '/year' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Subscribe',
          onPress: async () => {
            const result = await subscribeToPlan(planId);
            if (result.success) {
              Alert.alert(
                'Welcome to Premium!',
                'You\'ve just made the smartest ₹99 decision since buying that extra samosa. Enjoy!',
              );
            }
          },
        },
      ],
    );
  };

  const renderPlanCard = (planId: PlanId) => {
    const plan = PLANS[planId];
    const foundingPrice = FOUNDING_PRICES[planId];
    const isCurrentPlan = subscription?.planId === planId;
    const hasBadge = !!plan.badge;

    return (
      <View key={planId} style={[styles.planCard, hasBadge && styles.planCardHighlighted, isCurrentPlan && styles.planCardActive]}>
        {hasBadge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{plan.badge}</Text>
          </View>
        )}

        <View style={styles.planHeader}>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.planTagline}>{plan.tagline}</Text>
        </View>

        <View style={styles.priceRow}>
          {foundingPrice ? (
            <>
              <Text style={styles.priceStrike}>₹{plan.price}</Text>
              <Text style={styles.priceAmount}>₹{foundingPrice}</Text>
            </>
          ) : (
            <Text style={styles.priceAmount}>
              {plan.price === 0 ? 'Free' : `₹${plan.price}`}
            </Text>
          )}
          {plan.period !== 'free' && plan.period !== 'lifetime' && (
            <Text style={styles.pricePeriod}>/{plan.period === 'monthly' ? 'mo' : 'yr'}</Text>
          )}
        </View>

        {plan.savings && (
          <View style={styles.savingsBadge}>
            <Text style={styles.savingsText}>{plan.savings}</Text>
          </View>
        )}

        <View style={styles.featureList}>
          {plan.features.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={styles.featureCheck}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        {isCurrentPlan ? (
          <View style={styles.currentPlanBtn}>
            <Text style={styles.currentPlanBtnText}>Current Plan</Text>
          </View>
        ) : planId === 'free' ? null : (
          <TouchableOpacity
            style={[styles.subscribeBtn, hasBadge && styles.subscribeBtnHighlighted]}
            onPress={() => handleSubscribe(planId)}
            activeOpacity={0.8}
          >
            <Text style={[styles.subscribeBtnText, hasBadge && styles.subscribeBtnTextHighlighted]}>
              {plan.period === 'lifetime' ? 'Get Lifetime Access' : 'Start Premium'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <LinearGradient
          colors={['#1C1708', '#0E0C04', COLORS.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroAccent} />
          <Text style={styles.heroEmoji}>✨</Text>
          <Text style={styles.heroTitle}>Trackk Premium</Text>
          <Text style={styles.heroSubtitle}>{HERO_LINES[Math.floor(Math.random() * HERO_LINES.length)]}</Text>

          {isPremium && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>ACTIVE</Text>
            </View>
          )}
        </LinearGradient>

        {/* Social proof nudge */}
        <View style={styles.socialProof}>
          <Text style={styles.socialProofText}>
            Join 2,000+ smart spenders who upgraded this month
          </Text>
        </View>

        {/* Tab selector */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'individual' && styles.tabActive]}
            onPress={() => switchTab('individual')}
          >
            <Text style={[styles.tabText, selectedTab === 'individual' && styles.tabTextActive]}>
              For You
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'family' && styles.tabActive]}
            onPress={() => switchTab('family')}
          >
            <Text style={[styles.tabText, selectedTab === 'family' && styles.tabTextActive]}>
              For Family
            </Text>
          </TouchableOpacity>
        </View>

        {/* Plans */}
        <Animated.View style={{ opacity: fadeAnim }}>
          {selectedTab === 'individual' ? (
            <>
              {renderPlanCard('free')}
              {renderPlanCard('premium_monthly')}
              {renderPlanCard('premium_annual')}
              {renderPlanCard('premium_lifetime')}
            </>
          ) : (
            <>
              {renderPlanCard('family_monthly')}
              {renderPlanCard('family_annual')}

              {/* Social lock-in messaging */}
              <View style={styles.familyNudge}>
                <Text style={styles.familyNudgeIcon}>👨‍👩‍👧‍👦</Text>
                <Text style={styles.familyNudgeTitle}>Better together</Text>
                <Text style={styles.familyNudgeText}>
                  When the whole family tracks together, everyone saves more.{'\n'}
                  If one member's plan lapses, the whole family loses premium — so everyone stays motivated!
                </Text>
              </View>
            </>
          )}
        </Animated.View>

        {/* Comparison: what you're really paying for */}
        <View style={styles.comparisonCard}>
          <Text style={styles.comparisonTitle}>PUT IT IN PERSPECTIVE</Text>
          <View style={styles.comparisonDivider} />
          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonEmoji}>☕</Text>
            <Text style={styles.comparisonText}>
              Premium costs less than one chai per day
            </Text>
          </View>
          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonEmoji}>🍕</Text>
            <Text style={styles.comparisonText}>
              Family plan = ₹37/person — literally less than a samosa
            </Text>
          </View>
          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonEmoji}>🧾</Text>
            <Text style={styles.comparisonText}>
              Average user finds ₹2,400/month in "where did my money go?"
            </Text>
          </View>
          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonEmoji}>🤝</Text>
            <Text style={styles.comparisonText}>
              Premium pays for itself in the first week of tracking
            </Text>
          </View>
        </View>

        {/* Promo Code */}
        <View style={styles.promoSection}>
          <Text style={styles.promoLabel}>Have a promo code?</Text>
          <View style={styles.promoRow}>
            <TextInput
              style={styles.promoInput}
              value={promoCode}
              onChangeText={setPromoCode}
              placeholder="Enter code"
              placeholderTextColor={COLORS.textSecondary}
              selectionColor={COLORS.primary}
              autoCapitalize="characters"
              maxLength={20}
            />
            <TouchableOpacity
              style={[styles.promoBtn, promoLoading && { opacity: 0.5 }]}
              onPress={handlePromoCode}
              disabled={promoLoading}
              activeOpacity={0.8}
            >
              <Text style={styles.promoBtnText}>{promoLoading ? '...' : 'Apply'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Guarantees */}
        <View style={styles.guaranteeRow}>
          <View style={styles.guaranteeBadge}>
            <Text style={styles.guaranteeEmoji}>🔒</Text>
            <Text style={styles.guaranteeText}>Secure payment via Razorpay</Text>
          </View>
          <View style={styles.guaranteeBadge}>
            <Text style={styles.guaranteeEmoji}>↩️</Text>
            <Text style={styles.guaranteeText}>Cancel anytime, no questions</Text>
          </View>
          <View style={styles.guaranteeBadge}>
            <Text style={styles.guaranteeEmoji}>🛡️</Text>
            <Text style={styles.guaranteeText}>Free features stay free forever</Text>
          </View>
        </View>

        {/* Free promise */}
        <View style={styles.freePromise}>
          <Text style={styles.freePromiseText}>
            "We will never limit your daily expense entries.{'\n'}
            Your data is yours, always."
          </Text>
          <Text style={styles.freePromiseAuthor}>— Team Trackk</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 32 },

  /* ── Hero ────────────────────────────────────────────────────── */
  heroCard: {
    borderRadius: 20,
    padding: 28,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  heroAccent: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 2,
    backgroundColor: COLORS.primary,
  },
  heroEmoji: { fontSize: 40, marginBottom: 12 },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontStyle: 'italic',
  },
  activeBadge: {
    marginTop: 12,
    backgroundColor: `${COLORS.success}20`,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${COLORS.success}40`,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: 1,
  },

  /* ── Social Proof ───────────────────────────────────────────── */
  socialProof: {
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.primary}20`,
  },
  socialProofText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primaryLight,
    textAlign: 'center',
  },

  /* ── Tab Selector ───────────────────────────────────────────── */
  tabRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.background,
  },

  /* ── Plan Card ──────────────────────────────────────────────── */
  planCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  planCardHighlighted: {
    borderColor: `${COLORS.primary}50`,
    borderWidth: 2,
  },
  planCardActive: {
    borderColor: `${COLORS.success}50`,
    borderWidth: 2,
  },
  badge: {
    position: 'absolute',
    top: -1,
    right: 20,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.background,
    letterSpacing: 1,
  },
  planHeader: {
    marginBottom: 12,
  },
  planName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  planTagline: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  priceStrike: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textDecorationLine: 'line-through',
    marginRight: 8,
  },
  priceAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.primary,
  },
  pricePeriod: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginLeft: 2,
  },
  savingsBadge: {
    alignSelf: 'flex-start',
    backgroundColor: `${COLORS.success}18`,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${COLORS.success}30`,
  },
  savingsText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.success,
  },
  featureList: {
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  featureCheck: {
    fontSize: 14,
    color: COLORS.success,
    marginRight: 10,
    fontWeight: '700',
  },
  featureText: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
    lineHeight: 18,
  },
  subscribeBtn: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  subscribeBtnHighlighted: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  subscribeBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  subscribeBtnTextHighlighted: {
    color: COLORS.background,
  },
  currentPlanBtn: {
    backgroundColor: `${COLORS.success}15`,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.success}30`,
  },
  currentPlanBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: 0.3,
  },

  /* ── Family Nudge ──────────────────────────────────────────── */
  familyNudge: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  familyNudgeIcon: { fontSize: 32, marginBottom: 10 },
  familyNudgeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  familyNudgeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  /* ── Comparison Card ───────────────────────────────────────── */
  comparisonCard: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 20,
    marginTop: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  comparisonTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  comparisonDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 14,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  comparisonEmoji: { fontSize: 20 },
  comparisonText: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
    lineHeight: 18,
  },

  /* ── Promo Code ────────────────────────────────────────────── */
  promoSection: {
    marginBottom: 24,
  },
  promoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  promoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  promoInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    letterSpacing: 1,
  },
  promoBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.background,
  },

  /* ── Guarantees ────────────────────────────────────────────── */
  guaranteeRow: {
    gap: 8,
    marginBottom: 24,
  },
  guaranteeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  guaranteeEmoji: { fontSize: 18 },
  guaranteeText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },

  /* ── Free Promise ──────────────────────────────────────────── */
  freePromise: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  freePromiseText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontStyle: 'italic',
  },
  freePromiseAuthor: {
    fontSize: 12,
    color: COLORS.primaryDark,
    marginTop: 8,
    fontWeight: '600',
  },
});
