import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getTransactions } from '../services/StorageService';
import { Transaction } from '../models/types';
import { usePremium } from '../store/PremiumContext';
import { COLORS, formatCurrency } from '../utils/helpers';

// ─── Category detection ──────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food & Dining': ['swiggy', 'zomato', 'restaurant', 'food', 'cafe', 'coffee', 'tea', 'pizza', 'burger', 'biryani', 'hotel', 'mess', 'canteen', 'dominos', 'mcdonald', 'kfc', 'starbucks', 'chaayos'],
  'Shopping': ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'mall', 'shop', 'store', 'mart', 'bazaar', 'decathlon'],
  'Transport': ['uber', 'ola', 'rapido', 'metro', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'irctc', 'train', 'bus', 'auto', 'cab'],
  'Bills & Utilities': ['electricity', 'water', 'gas', 'wifi', 'broadband', 'jio', 'airtel', 'vi ', 'bsnl', 'dth', 'recharge', 'bill'],
  'Entertainment': ['netflix', 'hotstar', 'prime', 'spotify', 'youtube', 'movie', 'pvr', 'inox', 'game', 'concert'],
  'Health': ['pharmacy', 'medical', 'hospital', 'doctor', 'apollo', 'medplus', 'gym', 'fitness', 'pharmeasy', '1mg'],
  'Education': ['course', 'book', 'udemy', 'unacademy', 'byjus', 'school', 'college', 'tuition', 'library'],
  'Transfers': ['upi', 'neft', 'imps', 'transfer', 'sent to', 'paid to'],
};

function detectCategory(txn: Transaction): string {
  if (txn.category) return txn.category;
  const text = `${txn.description} ${txn.merchant || ''}`.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) return cat;
  }
  return 'Other';
}

interface CategoryData {
  name: string;
  amount: number;
  count: number;
  percentage: number;
  color: string;
}

const CAT_COLORS: Record<string, string> = {
  'Food & Dining': '#E8B84A',
  'Shopping': '#8A78F0',
  'Transport': '#45A8D4',
  'Bills & Utilities': '#E07888',
  'Entertainment': '#DD70A0',
  'Health': '#3CB882',
  'Education': '#6BCFC0',
  'Transfers': '#70B0F0',
  'Other': '#6A6A8E',
};

function getMonthTransactions(txns: Transaction[], monthsAgo: number): Transaction[] {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0, 23, 59, 59, 999);
  return txns.filter(t => {
    const d = new Date(t.timestamp);
    return d >= target && d <= end;
  });
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function InsightsScreen() {
  const nav = useNavigation<Nav>();
  const { isPremium } = usePremium();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'all'>('month');

  const load = useCallback(async () => {
    const all = await getTransactions();
    setTransactions(all.filter(t => !t.groupId));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const now = new Date();
  const thisMonthTxns = getMonthTransactions(transactions, 0);
  const lastMonthTxns = getMonthTransactions(transactions, 1);

  const displayTxns = selectedPeriod === 'month' ? thisMonthTxns : transactions;
  const totalSpent = displayTxns.reduce((s, t) => s + t.amount, 0);

  // Category breakdown
  const categoryMap: Record<string, { amount: number; count: number }> = {};
  for (const t of displayTxns) {
    const cat = detectCategory(t);
    if (!categoryMap[cat]) categoryMap[cat] = { amount: 0, count: 0 };
    categoryMap[cat].amount += t.amount;
    categoryMap[cat].count++;
  }

  const categories: CategoryData[] = Object.entries(categoryMap)
    .map(([name, data]) => ({
      name,
      amount: data.amount,
      count: data.count,
      percentage: totalSpent > 0 ? (data.amount / totalSpent) * 100 : 0,
      color: CAT_COLORS[name] || '#6A6A8E',
    }))
    .sort((a, b) => b.amount - a.amount);

  // Free users see top 3, premium sees all
  const visibleCategories = isPremium ? categories : categories.slice(0, 3);
  const hiddenCount = isPremium ? 0 : Math.max(categories.length - 3, 0);

  // Top merchants
  const merchantMap: Record<string, { amount: number; count: number }> = {};
  for (const t of displayTxns) {
    const m = t.merchant || t.description;
    if (!merchantMap[m]) merchantMap[m] = { amount: 0, count: 0 };
    merchantMap[m].amount += t.amount;
    merchantMap[m].count++;
  }
  const topMerchants = Object.entries(merchantMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Month comparison
  const thisMonthTotal = thisMonthTxns.reduce((s, t) => s + t.amount, 0);
  const lastMonthTotal = lastMonthTxns.reduce((s, t) => s + t.amount, 0);
  const monthDiff = lastMonthTotal > 0
    ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
    : 0;

  // Average daily
  const daysInMonth = now.getDate();
  const avgDaily = daysInMonth > 0 ? thisMonthTotal / daysInMonth : 0;

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Period toggle — premium for All Time */}
      <View style={styles.periodRow}>
        <TouchableOpacity
          style={[styles.periodBtn, selectedPeriod === 'month' && styles.periodBtnActive]}
          onPress={() => setSelectedPeriod('month')}
        >
          <Text style={[styles.periodText, selectedPeriod === 'month' && styles.periodTextActive]}>
            This Month
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodBtn, selectedPeriod === 'all' && styles.periodBtnActive]}
          onPress={() => {
            if (!isPremium) { nav.navigate('Pricing'); return; }
            setSelectedPeriod('all');
          }}
        >
          <Text style={[styles.periodText, selectedPeriod === 'all' && styles.periodTextActive]}>
            All Time {!isPremium ? '🔒' : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary hero */}
      <LinearGradient
        colors={['#140E20', '#0A0A0F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={[styles.heroAccent, { backgroundColor: COLORS.primary }]} />
        <View style={styles.heroRow}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>TOTAL SPENT</Text>
            <Text style={styles.heroStatValue}>{formatCurrency(totalSpent)}</Text>
            <Text style={styles.heroStatSub}>{displayTxns.length} transactions</Text>
          </View>
          {selectedPeriod === 'month' && (
            <>
              <View style={styles.heroDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>AVG / DAY</Text>
                <Text style={[styles.heroStatValue, { fontSize: 18 }]}>{formatCurrency(avgDaily)}</Text>
                <Text style={styles.heroStatSub}>
                  {monthDiff !== 0
                    ? `${monthDiff > 0 ? '+' : ''}${monthDiff.toFixed(0)}% vs last month`
                    : 'vs last month'}
                </Text>
              </View>
            </>
          )}
        </View>
      </LinearGradient>

      {/* Month comparison — free, always visible */}
      {selectedPeriod === 'month' && lastMonthTotal > 0 && (
        <View style={[styles.comparisonCard, { borderColor: monthDiff > 0 ? `${COLORS.danger}40` : `${COLORS.success}40` }]}>
          <Text style={styles.comparisonEmoji}>{monthDiff > 0 ? '📈' : '📉'}</Text>
          <View style={styles.comparisonContent}>
            <Text style={styles.comparisonTitle}>
              {monthDiff > 0 ? 'Spending up' : 'Spending down'} {Math.abs(monthDiff).toFixed(0)}%
            </Text>
            <Text style={styles.comparisonSub}>
              Last month: {formatCurrency(lastMonthTotal)}
            </Text>
          </View>
        </View>
      )}

      {/* Category breakdown — top 3 free, rest premium */}
      <Text style={styles.sectionTitle}>WHERE YOUR MONEY GOES</Text>
      {categories.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No transactions to analyze</Text>
        </View>
      ) : (
        <View style={styles.categoriesCard}>
          {/* Bar chart — visible categories */}
          <View style={styles.barChart}>
            {visibleCategories.map(cat => (
              <View key={cat.name} style={styles.barRow}>
                <View style={styles.barLabelCol}>
                  <Text style={styles.barLabel} numberOfLines={1}>{cat.name}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${cat.percentage}%`, backgroundColor: cat.color }]} />
                </View>
                <Text style={styles.barPercent}>{cat.percentage.toFixed(0)}%</Text>
              </View>
            ))}
          </View>

          {/* Category amounts */}
          {visibleCategories.map((cat, idx) => (
            <View key={cat.name} style={[styles.catRow, idx === visibleCategories.length - 1 && hiddenCount === 0 && styles.catRowLast]}>
              <View style={[styles.catDot, { backgroundColor: cat.color }]} />
              <View style={styles.catInfo}>
                <Text style={styles.catName}>{cat.name}</Text>
                <Text style={styles.catCount}>{cat.count} transactions</Text>
              </View>
              <Text style={styles.catAmount}>{formatCurrency(cat.amount)}</Text>
            </View>
          ))}

          {/* Premium gate for remaining categories */}
          {hiddenCount > 0 && (
            <TouchableOpacity style={styles.unlockRow} onPress={() => nav.navigate('Pricing')} activeOpacity={0.7}>
              <Text style={styles.unlockText}>
                +{hiddenCount} more {hiddenCount === 1 ? 'category' : 'categories'}
              </Text>
              <Text style={styles.unlockCta}>Unlock with Premium</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Top merchants — premium only */}
      {isPremium ? (
        <>
          <Text style={styles.sectionTitle}>TOP MERCHANTS</Text>
          {topMerchants.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No merchant data yet</Text>
            </View>
          ) : (
            <View style={styles.merchantCard}>
              {topMerchants.map((m, idx) => (
                <View key={m.name} style={[styles.merchantRow, idx === topMerchants.length - 1 && styles.merchantRowLast]}>
                  <Text style={styles.merchantRank}>#{idx + 1}</Text>
                  <View style={styles.merchantInfo}>
                    <Text style={styles.merchantName} numberOfLines={1}>{m.name}</Text>
                    <Text style={styles.merchantCount}>{m.count} payments</Text>
                  </View>
                  <Text style={styles.merchantAmount}>{formatCurrency(m.amount)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}

      {/* Daily trend — premium only */}
      {isPremium && selectedPeriod === 'month' && (
        <>
          <Text style={styles.sectionTitle}>DAILY TREND</Text>
          <View style={styles.trendCard}>
            {Array.from({ length: Math.min(daysInMonth, 31) }, (_, i) => {
              const day = i + 1;
              const dayTxns = thisMonthTxns.filter(t => new Date(t.timestamp).getDate() === day);
              const dayTotal = dayTxns.reduce((s, t) => s + t.amount, 0);
              const maxDay = Math.max(...Array.from({ length: daysInMonth }, (_, j) => {
                return thisMonthTxns.filter(t => new Date(t.timestamp).getDate() === j + 1).reduce((s, t) => s + t.amount, 0);
              }), 1);
              const height = Math.max((dayTotal / maxDay) * 60, 2);
              const isToday = day === now.getDate();
              return (
                <View key={day} style={styles.trendBarWrap}>
                  <View
                    style={[
                      styles.trendBar,
                      { height, backgroundColor: isToday ? COLORS.primary : `${COLORS.primary}40` },
                    ]}
                  />
                  {(day === 1 || day === 15 || day === daysInMonth) && (
                    <Text style={styles.trendDayLabel}>{day}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Premium upsell — only for free users, at the bottom */}
      {!isPremium && (
        <TouchableOpacity style={styles.premiumBanner} onPress={() => nav.navigate('Pricing')} activeOpacity={0.8}>
          <View style={styles.premiumBannerContent}>
            <Text style={styles.premiumBannerTitle}>See the full picture</Text>
            <Text style={styles.premiumBannerSub}>
              Top merchants, daily trends, all categories, and more
            </Text>
          </View>
          <Text style={styles.premiumBannerCta}>Upgrade</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },

  periodRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  periodBtnActive: {
    backgroundColor: `${COLORS.primary}20`,
    borderColor: `${COLORS.primary}40`,
  },
  periodText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  periodTextActive: {
    color: COLORS.primary,
  },

  heroCard: {
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  heroAccent: { height: 2 },
  heroRow: {
    flexDirection: 'row',
    padding: 20,
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
  },
  heroStatLabel: {
    fontSize: 9,
    color: COLORS.textSecondary,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 8,
  },
  heroStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  heroStatSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  comparisonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    gap: 12,
  },
  comparisonEmoji: { fontSize: 24 },
  comparisonContent: { flex: 1 },
  comparisonTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  comparisonSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 8,
  },

  categoriesCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
  },
  barChart: { marginBottom: 12 },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  barLabelCol: { width: 90 },
  barLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barPercent: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    width: 32,
    textAlign: 'right',
  },

  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  catRowLast: { borderBottomWidth: 0 },
  catDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  catInfo: { flex: 1 },
  catName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  catCount: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  catAmount: { fontSize: 13, fontWeight: '700', color: COLORS.text },

  unlockRow: {
    paddingTop: 12,
    alignItems: 'center',
  },
  unlockText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  unlockCta: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
  },

  merchantCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 16,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  merchantRowLast: { borderBottomWidth: 0 },
  merchantRank: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textSecondary,
    width: 28,
  },
  merchantInfo: { flex: 1 },
  merchantName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  merchantCount: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  merchantAmount: { fontSize: 13, fontWeight: '700', color: COLORS.text },

  trendCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    paddingBottom: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: 2,
  },
  trendBarWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  trendBar: {
    width: '80%',
    borderRadius: 2,
    minHeight: 2,
  },
  trendDayLabel: {
    fontSize: 8,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: `${COLORS.primary}25`,
  },
  premiumBannerContent: { flex: 1 },
  premiumBannerTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  premiumBannerSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  premiumBannerCta: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    paddingLeft: 12,
  },

  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
});
