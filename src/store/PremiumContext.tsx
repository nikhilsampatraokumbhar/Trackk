import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';
import {
  PlanId, SubscriptionPlan, UserSubscription, PromoCode,
  Referral, ReferralStats,
} from '../models/types';
import { generateId } from '../utils/helpers';

// ─── Plan Definitions ───────────────────────────────────────────────────────

export const PLANS: Record<PlanId, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'free',
    maxMembers: 1,
    tagline: 'Track smart, spend smarter',
    features: [
      'Unlimited expense entries',
      'SMS auto-detection',
      'Up to 3 groups',
      'This month\'s insights (top 3 categories)',
      '1 savings goal',
      'Notes on recent transactions (30 days)',
      '1 overall budget',
    ],
  },
  premium_monthly: {
    id: 'premium_monthly',
    name: 'Premium',
    price: 99,
    period: 'monthly',
    maxMembers: 1,
    tagline: '\u20B91.6/day \u2014 your piggy bank charges more in guilt',
    features: [
      'Everything in Free',
      'Cloud backup & sync',
      'Unlimited groups & goals',
      'Full insights, all categories & trends',
      'Per-category budgets',
      'Notes on all transactions',
      'Unlimited export (CSV, PDF)',
      'Priority support',
    ],
    badge: 'POPULAR',
  },
  premium_half_yearly: {
    id: 'premium_half_yearly',
    name: 'Premium 6 Months',
    price: 399,
    period: 'half_yearly',
    maxMembers: 1,
    tagline: '\u20B966/mo \u2014 cheaper than your chai habit',
    features: [
      'Everything in Premium',
      '1 month free vs monthly',
    ],
    savings: 'Save \u20B9195',
  },
  premium_annual: {
    id: 'premium_annual',
    name: 'Premium Annual',
    price: 699,
    period: 'annual',
    maxMembers: 1,
    tagline: '\u20B933/month as founding member \u2014 that\'s literally 1 samosa',
    features: [
      'Everything in Premium',
      '3 months free vs monthly',
    ],
    savings: 'Save \u20B9489/year',
    badge: 'BEST VALUE',
  },
  premium_lifetime: {
    id: 'premium_lifetime',
    name: 'Premium Lifetime',
    price: 1999,
    period: 'lifetime',
    maxMembers: 1,
    tagline: 'Pay once, track forever \u2014 your gym membership costs more. And you don\'t even go.',
    features: [
      'Everything in Premium',
      'Lifetime access, no renewals',
      'All future features included',
      'Founding member badge',
    ],
  },
  family_monthly: {
    id: 'family_monthly',
    name: 'Family',
    price: 149,
    period: 'monthly',
    maxMembers: 4,
    tagline: '\u20B937/person \u2014 less than a samosa per day',
    features: [
      'Everything in Premium',
      'Up to 4 family members',
      'Shared family dashboard',
      'Family spending insights',
      'Shared budgets & goals',
    ],
    badge: 'FAMILY',
  },
  family_annual: {
    id: 'family_annual',
    name: 'Family Annual',
    price: 999,
    period: 'annual',
    maxMembers: 4,
    tagline: '\u20B921/person/month \u2014 less than a packet of chips',
    features: [
      'Everything in Family',
      '3 months free vs monthly',
    ],
    savings: 'Save \u20B9789/year',
  },
};

// ─── Founding member pricing (Phase 2) ──────────────────────────────────────

export const FOUNDING_PRICES: Partial<Record<PlanId, number>> = {
  premium_monthly: 49,
  premium_half_yearly: 199,
  premium_annual: 399,
  family_monthly: 99,
  family_annual: 599,
};

// ─── Built-in Promo Codes ───────────────────────────────────────────────────

// Promo codes — in production, validate these server-side via Firebase Cloud Functions.
// Remove test codes before public release.
const PROMO_CODES: Record<string, PromoCode> = {
  'LAUNCH50':    { code: 'LAUNCH50', type: 'discount', durationDays: 30, discountPercent: 50 },
  'FOUNDING':    { code: 'FOUNDING', type: 'full_access', durationDays: 90 },
};

// DEV-ONLY promo codes — stripped in production builds via __DEV__ flag
if (__DEV__) {
  Object.assign(PROMO_CODES, {
    'TRACKK_BETA': { code: 'TRACKK_BETA', type: 'full_access', durationDays: 365 },
    'TRACKK_TEST': { code: 'TRACKK_TEST', type: 'full_access', durationDays: 30 },
    'TRACKK_DEV':  { code: 'TRACKK_DEV', type: 'full_access', durationDays: 9999 },
  });
}

// ─── Storage Keys ───────────────────────────────────────────────────────────

const KEYS = {
  SUBSCRIPTION: '@et_subscription',
  REFERRALS: '@et_referrals',
  REFERRAL_CODE: '@et_referral_code',
};

// ─── Context ────────────────────────────────────────────────────────────────

interface PremiumContextType {
  subscription: UserSubscription | null;
  isPremium: boolean;
  isFamily: boolean;
  isTrial: boolean;
  currentPlan: SubscriptionPlan;
  referralCode: string;
  referralStats: ReferralStats;
  referrals: Referral[];

  // Actions
  activatePromoCode: (code: string) => Promise<{ success: boolean; message: string }>;
  subscribeToPlan: (planId: PlanId) => Promise<{ success: boolean; orderId?: string }>;
  cancelSubscription: () => Promise<void>;
  addFamilyMember: (phone: string) => Promise<void>;
  removeFamilyMember: (phone: string) => Promise<void>;
  shareReferralLink: () => Promise<void>;
  addReferral: (phone: string) => Promise<void>;
  qualifyReferral: (phone: string) => Promise<void>;
  checkFeatureAccess: (feature: PremiumFeature) => boolean;
  refreshSubscription: () => Promise<void>;
}

export type PremiumFeature =
  | 'cloud_backup'
  | 'unlimited_groups'
  | 'unlimited_goals'
  | 'advanced_analytics'
  | 'full_insights'
  | 'category_budgets'
  | 'unlimited_notes'
  | 'unlimited_export'
  | 'receipt_storage'
  | 'family_dashboard'
  | 'shared_budgets'
  | 'priority_support';

const FREE_FEATURES: Set<PremiumFeature> = new Set();

const PremiumContext = createContext<PremiumContextType>({} as PremiumContextType);

export function PremiumProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralCode, setReferralCode] = useState('');

  // ── Load state ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const subRaw = await AsyncStorage.getItem(KEYS.SUBSCRIPTION);
      if (subRaw) {
        const sub: UserSubscription = JSON.parse(subRaw);
        // Check expiry
        if (sub.endDate !== -1 && sub.endDate < Date.now()) {
          sub.status = 'expired';
          await AsyncStorage.setItem(KEYS.SUBSCRIPTION, JSON.stringify(sub));
        }
        setSubscription(sub);
      }

      const refRaw = await AsyncStorage.getItem(KEYS.REFERRALS);
      if (refRaw) setReferrals(JSON.parse(refRaw));

      let code = await AsyncStorage.getItem(KEYS.REFERRAL_CODE);
      if (!code) {
        code = `TRACKK_${userId.slice(-6).toUpperCase()}`;
        await AsyncStorage.setItem(KEYS.REFERRAL_CODE, code);
      }
      setReferralCode(code);
    })();
  }, [userId]);

  // ── Derived state ───────────────────────────────────────────────────────
  const isPremium = subscription?.status === 'active' || subscription?.status === 'trial';
  const isFamily = isPremium && (subscription?.planId === 'family_monthly' || subscription?.planId === 'family_annual');
  const isTrial = subscription?.status === 'trial';
  const currentPlan = PLANS[subscription?.planId || 'free'];

  const referralStats: ReferralStats = {
    totalReferred: referrals.length,
    qualified: referrals.filter(r => r.refereeQualified).length,
    freeMonthsEarned: Math.min(referrals.filter(r => r.refereeQualified).length, 12),
    freeMonthsUsed: subscription?.referralCreditsMonths || 0,
    nextMilestone: 5 - (referrals.filter(r => r.refereeQualified).length % 5),
    milestoneReward: referrals.filter(r => r.refereeQualified).length < 5
      ? '6 months free premium'
      : '12 months free premium',
  };

  // ── Promo code activation ──────────────────────────────────────────────
  const activatePromoCode = useCallback(async (code: string): Promise<{ success: boolean; message: string }> => {
    const upperCode = code.trim().toUpperCase();
    const promo = PROMO_CODES[upperCode];

    if (!promo) {
      return { success: false, message: 'Invalid promo code. Check and try again.' };
    }

    if (subscription?.promoCodeUsed === upperCode) {
      return { success: false, message: 'You\'ve already used this promo code.' };
    }

    const now = Date.now();
    const endDate = promo.type === 'full_access'
      ? (promo.durationDays >= 9999 ? -1 : now + promo.durationDays * 24 * 60 * 60 * 1000)
      : now + promo.durationDays * 24 * 60 * 60 * 1000;

    const newSub: UserSubscription = {
      planId: 'premium_monthly',
      status: 'active',
      startDate: now,
      endDate,
      isFoundingMember: true,
      promoCodeUsed: upperCode,
      referralCreditsMonths: subscription?.referralCreditsMonths || 0,
    };

    await AsyncStorage.setItem(KEYS.SUBSCRIPTION, JSON.stringify(newSub));
    setSubscription(newSub);

    const daysText = promo.durationDays >= 9999 ? 'unlimited' : `${promo.durationDays} days`;
    return {
      success: true,
      message: `Welcome to Trackk Premium! You have ${daysText} of full access.`,
    };
  }, [subscription]);

  // ── Subscribe to plan ──────────────────────────────────────────────────
  const subscribeToPlan = useCallback(async (planId: PlanId): Promise<{ success: boolean; orderId?: string }> => {
    const { initiatePayment, verifyPaymentServer } = require('../services/PaymentService');

    // Step 1: Initiate payment (Razorpay checkout or simulated)
    const payResult = await initiatePayment(planId, '', '', '');
    if (!payResult.success) {
      return { success: false };
    }

    // Step 2: Verify payment server-side (activates subscription in Firestore)
    if (payResult.signature && payResult.signature !== 'simulated') {
      const verifyResult = await verifyPaymentServer(
        payResult.paymentId, payResult.orderId, payResult.signature, planId
      );
      if (verifyResult.success && verifyResult.subscription) {
        // Server activated — cache locally
        await AsyncStorage.setItem(KEYS.SUBSCRIPTION, JSON.stringify(verifyResult.subscription));
        setSubscription(verifyResult.subscription);
        return { success: true, orderId: payResult.orderId };
      }
    }

    // Dev/simulated mode — activate locally
    const now = Date.now();
    const plan = PLANS[planId];
    let endDate: number;

    switch (plan.period) {
      case 'monthly': endDate = now + 30 * 24 * 60 * 60 * 1000; break;
      case 'half_yearly': endDate = now + 182 * 24 * 60 * 60 * 1000; break;
      case 'annual': endDate = now + 365 * 24 * 60 * 60 * 1000; break;
      case 'lifetime': endDate = -1; break;
      default: endDate = now + 30 * 24 * 60 * 60 * 1000;
    }

    const newSub: UserSubscription = {
      planId,
      status: 'active',
      startDate: now,
      endDate,
      isFoundingMember: subscription?.isFoundingMember || !subscription,
      referralCreditsMonths: subscription?.referralCreditsMonths || 0,
    };

    await AsyncStorage.setItem(KEYS.SUBSCRIPTION, JSON.stringify(newSub));
    setSubscription(newSub);

    return { success: true, orderId: payResult.orderId };
  }, [subscription]);

  // ── Cancel ────────────────────────────────────────────────────────────
  const cancelSubscription = useCallback(async () => {
    if (subscription) {
      const updated = { ...subscription, status: 'expired' as const };
      await AsyncStorage.setItem(KEYS.SUBSCRIPTION, JSON.stringify(updated));
      setSubscription(updated);
    }
  }, [subscription]);

  // ── Family members ────────────────────────────────────────────────────
  const addFamilyMember = useCallback(async (phone: string) => {
    if (!subscription) return;
    const members = subscription.familyMembers || [];
    if (members.length >= PLANS[subscription.planId].maxMembers - 1) return;
    const updated = { ...subscription, familyMembers: [...members, phone] };
    await AsyncStorage.setItem(KEYS.SUBSCRIPTION, JSON.stringify(updated));
    setSubscription(updated);
  }, [subscription]);

  const removeFamilyMember = useCallback(async (phone: string) => {
    if (!subscription?.familyMembers) return;
    const updated = { ...subscription, familyMembers: subscription.familyMembers.filter(p => p !== phone) };
    await AsyncStorage.setItem(KEYS.SUBSCRIPTION, JSON.stringify(updated));
    setSubscription(updated);
  }, [subscription]);

  // ── Referrals ─────────────────────────────────────────────────────────
  const shareReferralLink = useCallback(async () => {
    try {
      await Share.share({
        message: `Hey! I use Trackk to track expenses and split with friends. It auto-reads your bank SMS — super handy!\n\nJoin using my code: ${referralCode}\n\nDownload: https://trackk.app/invite/${referralCode}`,
        title: 'Join me on Trackk',
      });
    } catch {}
  }, [referralCode]);

  const addReferral = useCallback(async (phone: string) => {
    const newRef: Referral = {
      id: generateId(),
      referrerId: userId,
      refereePhone: phone,
      refereeInstalled: true,
      refereeQualified: false,
      installDate: Date.now(),
      rewardClaimed: false,
    };
    const updated = [...referrals, newRef];
    setReferrals(updated);
    await AsyncStorage.setItem(KEYS.REFERRALS, JSON.stringify(updated));
  }, [referrals, userId]);

  const qualifyReferral = useCallback(async (phone: string) => {
    const updated = referrals.map(r =>
      r.refereePhone === phone
        ? { ...r, refereeQualified: true, qualifiedDate: Date.now() }
        : r,
    );
    setReferrals(updated);
    await AsyncStorage.setItem(KEYS.REFERRALS, JSON.stringify(updated));

    // Auto-apply referral reward: extend subscription by 1 month
    if (subscription && subscription.status === 'active') {
      const qualifiedCount = updated.filter(r => r.refereeQualified).length;
      if (qualifiedCount <= 12) {
        const monthMs = 30 * 24 * 60 * 60 * 1000;
        const extended = {
          ...subscription,
          endDate: subscription.endDate === -1 ? -1 : subscription.endDate + monthMs,
          referralCreditsMonths: qualifiedCount,
        };
        await AsyncStorage.setItem(KEYS.SUBSCRIPTION, JSON.stringify(extended));
        setSubscription(extended);
      }
    }
  }, [referrals, subscription]);

  // ── Feature access check ──────────────────────────────────────────────
  const checkFeatureAccess = useCallback((feature: PremiumFeature): boolean => {
    if (FREE_FEATURES.has(feature)) return true;
    if (!isPremium) return false;
    if (feature === 'family_dashboard' || feature === 'shared_budgets') return isFamily;
    return true;
  }, [isPremium, isFamily]);

  const refreshSubscription = useCallback(async () => {
    const raw = await AsyncStorage.getItem(KEYS.SUBSCRIPTION);
    if (raw) {
      const sub: UserSubscription = JSON.parse(raw);
      if (sub.endDate !== -1 && sub.endDate < Date.now()) {
        sub.status = 'expired';
        await AsyncStorage.setItem(KEYS.SUBSCRIPTION, JSON.stringify(sub));
      }
      setSubscription(sub);
    }
  }, []);

  const value = useMemo(() => ({
    subscription, isPremium, isFamily, isTrial, currentPlan,
    referralCode, referralStats, referrals,
    activatePromoCode, subscribeToPlan, cancelSubscription,
    addFamilyMember, removeFamilyMember,
    shareReferralLink, addReferral, qualifyReferral,
    checkFeatureAccess, refreshSubscription,
  }), [subscription, isPremium, isFamily, isTrial, currentPlan, referralCode, referralStats, referrals, activatePromoCode, subscribeToPlan, cancelSubscription, addFamilyMember, removeFamilyMember, shareReferralLink, addReferral, qualifyReferral, checkFeatureAccess, refreshSubscription]);

  return (
    <PremiumContext.Provider value={value}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  return useContext(PremiumContext);
}
