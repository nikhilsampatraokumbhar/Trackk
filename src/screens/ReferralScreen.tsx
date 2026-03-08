import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { usePremium } from '../store/PremiumContext';
import { COLORS } from '../utils/helpers';

const MILESTONES = [
  { count: 1, reward: '1 month free', emoji: '🎁' },
  { count: 3, reward: '3 months free', emoji: '🎉' },
  { count: 5, reward: '6 months free', emoji: '🏆' },
  { count: 10, reward: '12 months free (max)', emoji: '👑' },
];

export default function ReferralScreen() {
  const {
    referralCode, referralStats, referrals,
    shareReferralLink, isPremium,
  } = usePremium();

  const qualifiedCount = referralStats.qualified;

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
          <Text style={styles.heroEmoji}>🎁</Text>
          <Text style={styles.heroTitle}>Give Premium, Get Premium</Text>
          <Text style={styles.heroSubtitle}>
            Share Trackk with friends. When they start tracking,{'\n'}you both win.
          </Text>
        </LinearGradient>

        {/* How it works */}
        <View style={styles.howItWorks}>
          <Text style={styles.sectionTitle}>HOW IT WORKS</Text>
          <View style={styles.stepRow}>
            <View style={styles.stepBadge}><Text style={styles.stepNumber}>1</Text></View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Share your invite link</Text>
              <Text style={styles.stepText}>Send via WhatsApp, Instagram — anywhere</Text>
            </View>
          </View>
          <View style={styles.stepConnector} />
          <View style={styles.stepRow}>
            <View style={styles.stepBadge}><Text style={styles.stepNumber}>2</Text></View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Friend installs & tracks</Text>
              <Text style={styles.stepText}>They log 10 expenses within 14 days</Text>
            </View>
          </View>
          <View style={styles.stepConnector} />
          <View style={styles.stepRow}>
            <View style={styles.stepBadge}><Text style={styles.stepNumber}>3</Text></View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>You both get rewarded</Text>
              <Text style={styles.stepText}>You get 1 month free, they get a 30-day trial</Text>
            </View>
          </View>
        </View>

        {/* Your referral code */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>YOUR REFERRAL CODE</Text>
          <Text style={styles.codeText}>{referralCode}</Text>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={shareReferralLink}
            activeOpacity={0.8}
          >
            <Text style={styles.shareBtnText}>Share Invite Link</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{referralStats.totalReferred}</Text>
            <Text style={styles.statLabel}>Invited</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: COLORS.success }]}>{qualifiedCount}</Text>
            <Text style={styles.statLabel}>Qualified</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: COLORS.primary }]}>{referralStats.freeMonthsEarned}</Text>
            <Text style={styles.statLabel}>Months Free</Text>
          </View>
        </View>

        {/* Milestones */}
        <View style={styles.milestonesCard}>
          <Text style={styles.sectionTitle}>MILESTONES</Text>
          <View style={styles.milestonesDivider} />
          {MILESTONES.map((m, i) => {
            const achieved = qualifiedCount >= m.count;
            return (
              <View key={i} style={[styles.milestoneRow, achieved && styles.milestoneAchieved]}>
                <Text style={styles.milestoneEmoji}>{achieved ? '✅' : m.emoji}</Text>
                <View style={styles.milestoneContent}>
                  <Text style={[styles.milestoneCount, achieved && styles.milestoneCountDone]}>
                    {m.count} referral{m.count > 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.milestoneReward}>{m.reward}</Text>
                </View>
                {achieved && <Text style={styles.milestoneCheck}>Unlocked</Text>}
              </View>
            );
          })}
          <Text style={styles.milestonesCap}>
            Max 12 months free via referrals. Because even good things have limits.
          </Text>
        </View>

        {/* Natural viral loop nudge */}
        <View style={styles.viralNudge}>
          <Text style={styles.viralNudgeIcon}>💡</Text>
          <Text style={styles.viralNudgeTitle}>Pro tip</Text>
          <Text style={styles.viralNudgeText}>
            Create a group expense and share the invite link via WhatsApp.{'\n'}
            Friends who don't have Trackk will get a download link — that counts as your referral!
          </Text>
        </View>

        {/* Your referrals list */}
        {referrals.length > 0 && (
          <View style={styles.referralList}>
            <Text style={styles.sectionTitle}>YOUR REFERRALS</Text>
            {referrals.map((r) => (
              <View key={r.id} style={styles.referralRow}>
                <View style={styles.referralAvatar}>
                  <Text style={styles.referralAvatarText}>
                    {r.refereePhone.slice(-2)}
                  </Text>
                </View>
                <View style={styles.referralInfo}>
                  <Text style={styles.referralPhone}>
                    {r.refereePhone.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2')}
                  </Text>
                  <Text style={[
                    styles.referralStatus,
                    r.refereeQualified ? { color: COLORS.success } : { color: COLORS.warning },
                  ]}>
                    {r.refereeQualified ? 'Qualified — you earned 1 month!' : 'Installed — waiting for 10 expenses'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 32 },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 14,
  },

  /* ── Hero ─────────────────────────────────────────────────── */
  heroCard: {
    borderRadius: 20,
    padding: 28,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    alignItems: 'center',
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
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  /* ── How it works ──────────────────────────────────────────── */
  howItWorks: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: `${COLORS.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.primary}40`,
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
  },
  stepContent: { flex: 1 },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  stepText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  stepConnector: {
    width: 2,
    height: 16,
    backgroundColor: `${COLORS.primary}30`,
    marginLeft: 15,
    marginVertical: 4,
  },

  /* ── Code Card ─────────────────────────────────────────────── */
  codeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.primary}40`,
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  codeText: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 3,
    marginBottom: 20,
  },
  shareBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.background,
    letterSpacing: 0.3,
  },

  /* ── Stats ─────────────────────────────────────────────────── */
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },

  /* ── Milestones ────────────────────────────────────────────── */
  milestonesCard: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  milestonesDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 14,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  milestoneAchieved: {
    backgroundColor: `${COLORS.success}10`,
  },
  milestoneEmoji: { fontSize: 22 },
  milestoneContent: { flex: 1 },
  milestoneCount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  milestoneCountDone: {
    color: COLORS.success,
  },
  milestoneReward: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  milestoneCheck: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
  },
  milestonesCap: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: 10,
    textAlign: 'center',
  },

  /* ── Viral Nudge ───────────────────────────────────────────── */
  viralNudge: {
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.primary}20`,
  },
  viralNudgeIcon: { fontSize: 24, marginBottom: 8 },
  viralNudgeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primaryLight,
    marginBottom: 6,
  },
  viralNudgeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  /* ── Referral List ─────────────────────────────────────────── */
  referralList: {
    marginBottom: 20,
  },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  referralAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceHigher,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  referralInfo: { flex: 1 },
  referralPhone: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  referralStatus: {
    fontSize: 11,
    fontWeight: '600',
  },
});
