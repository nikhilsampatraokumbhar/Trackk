/**
 * Auto-Detection Service for Subscriptions, Investments, and EMIs
 *
 * This service:
 * 1. Classifies incoming transactions as subscription/EMI/investment based on SMS keywords + merchant
 * 2. Auto-matches incoming transactions to existing tracked items (updates next billing date)
 * 3. Detects new recurring patterns from transaction history
 * 4. Handles shared subscription logic (someone else paying this month)
 * 5. Handles EMI completion (auto-deactivate when all months paid)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParsedTransaction, UserSubscriptionItem, InvestmentItem, EMIItem, Transaction } from '../models/types';
import {
  getSubscriptions, saveSubscription,
  getInvestments, saveInvestment,
  getEMIs, saveEMI,
} from './StorageService';
import { generateId } from '../utils/helpers';

// ─── Known Merchants & Keywords ────────────────────────────────────────────

/** Known subscription service merchants (normalized lowercase) */
const SUBSCRIPTION_MERCHANTS: Record<string, string> = {
  'netflix': 'Netflix',
  'amazon prime': 'Amazon Prime',
  'prime video': 'Amazon Prime',
  'amazonprime': 'Amazon Prime',
  'hotstar': 'Disney+ Hotstar',
  'disney': 'Disney+ Hotstar',
  'jiostar': 'JioStar',
  'jio star': 'JioStar',
  'jio fiber': 'Jio Fiber',
  'jio recharge': 'Jio Recharge',
  'airtel': 'Airtel',
  'vi recharge': 'Vi Recharge',
  'vodafone': 'Vodafone',
  'youtube': 'YouTube Premium',
  'youtube premium': 'YouTube Premium',
  'spotify': 'Spotify',
  'apple music': 'Apple Music',
  'apple one': 'Apple One',
  'icloud': 'iCloud',
  'google one': 'Google One',
  'claude': 'Claude',
  'anthropic': 'Claude',
  'chatgpt': 'ChatGPT Plus',
  'openai': 'ChatGPT Plus',
  'figma': 'Figma',
  'notion': 'Notion',
  'canva': 'Canva',
  'github': 'GitHub',
  'microsoft 365': 'Microsoft 365',
  'office 365': 'Microsoft 365',
  'linkedin': 'LinkedIn Premium',
  'flipkart plus': 'Flipkart Plus',
  'flipkart supercoins': 'Flipkart Plus',
  'swiggy one': 'Swiggy One',
  'swiggy super': 'Swiggy One',
  'zomato gold': 'Zomato Gold',
  'zomato pro': 'Zomato Pro',
  'zee5': 'Zee5',
  'sonyliv': 'SonyLIV',
  'mxplayer': 'MX Player',
  'jiocinema': 'JioCinema',
  'amazon music': 'Amazon Music',
  'adobe': 'Adobe',
  'dropbox': 'Dropbox',
  'slack': 'Slack',
  'zoom': 'Zoom',
  'cred mint': 'CRED Mint',
  'cred': 'CRED',
  'audible': 'Audible',
  'kindle': 'Kindle Unlimited',
  'playstation': 'PlayStation Plus',
  'xbox': 'Xbox Game Pass',
  'nordvpn': 'NordVPN',
  'expressvpn': 'ExpressVPN',
  'grammarly': 'Grammarly',
};

/** SMS keywords that indicate a subscription payment */
const SUBSCRIPTION_KEYWORDS = [
  'subscription', 'subscribed', 'renewal', 'renewed', 'recurring',
  'auto-renewal', 'auto renewal', 'auto debit', 'autopay', 'auto pay',
  'monthly plan', 'annual plan', 'yearly plan', 'membership',
  'plan renewal', 'recharge',
];

/** SMS keywords that indicate an EMI payment */
const EMI_KEYWORDS = [
  'emi', 'equated monthly', 'installment', 'instalment',
  'loan repayment', 'loan emi', 'home loan', 'car loan',
  'personal loan', 'education loan', 'emi deducted',
  'emi debited', 'credit card emi', 'no cost emi',
  'bajaj emi', 'bajaj finserv',
];

/** Known investment/SIP merchants and keywords */
const INVESTMENT_MERCHANTS: Record<string, string> = {
  'zerodha': 'Zerodha',
  'groww': 'Groww',
  'kuvera': 'Kuvera',
  'smallcase': 'Smallcase',
  'coin by zerodha': 'Zerodha Coin',
  'paytm money': 'Paytm Money',
  'etmoney': 'ET Money',
  'angel one': 'Angel One',
  'angel broking': 'Angel One',
  'upstox': 'Upstox',
  'nippon': 'Nippon India MF',
  'sbi mutual': 'SBI Mutual Fund',
  'hdfc mutual': 'HDFC Mutual Fund',
  'icici prudential': 'ICICI Prudential MF',
  'axis mutual': 'Axis Mutual Fund',
  'kotak mutual': 'Kotak Mutual Fund',
  'ppf': 'PPF',
  'nps': 'NPS',
  'bse star': 'BSE StarMF',
  'mfcentral': 'MFCentral',
  'fi money': 'Fi Money',
  'jupiter': 'Jupiter',
  'dhan': 'Dhan',
  '5paisa': '5paisa',
  'motilal oswal': 'Motilal Oswal',
  'franklin templeton': 'Franklin Templeton',
};

const INVESTMENT_KEYWORDS = [
  'sip', 'systematic investment', 'mutual fund', 'mf purchase',
  'nav allotment', 'units allotted', 'investment', 'invested',
  'folio', 'bse order', 'nse order', 'stock purchase',
  'ppf contribution', 'nps contribution', 'rd installment',
  'recurring deposit',
];

// ─── Transaction Classification ────────────────────────────────────────────

export type TransactionCategory = 'subscription' | 'emi' | 'investment' | null;

export interface ClassificationResult {
  category: TransactionCategory;
  matchedMerchant: string | null;
  confidence: number; // 0-1
}

/**
 * Classify a parsed transaction based on SMS content and merchant.
 * Returns the detected category and confidence.
 */
export function classifyTransaction(parsed: ParsedTransaction): ClassificationResult {
  const message = parsed.rawMessage.toLowerCase();
  const merchant = (parsed.merchant || '').toLowerCase();

  // 1. Check EMI keywords first (highest priority — most specific)
  for (const keyword of EMI_KEYWORDS) {
    if (message.includes(keyword)) {
      return { category: 'emi', matchedMerchant: parsed.merchant || null, confidence: 0.9 };
    }
  }

  // 2. Check investment merchants
  for (const [key, name] of Object.entries(INVESTMENT_MERCHANTS)) {
    if (merchant.includes(key) || message.includes(key)) {
      return { category: 'investment', matchedMerchant: name, confidence: 0.85 };
    }
  }

  // 3. Check investment keywords
  for (const keyword of INVESTMENT_KEYWORDS) {
    if (message.includes(keyword)) {
      return { category: 'investment', matchedMerchant: parsed.merchant || null, confidence: 0.8 };
    }
  }

  // 4. Check subscription merchants
  for (const [key, name] of Object.entries(SUBSCRIPTION_MERCHANTS)) {
    if (merchant.includes(key) || message.includes(key)) {
      return { category: 'subscription', matchedMerchant: name, confidence: 0.9 };
    }
  }

  // 5. Check subscription keywords
  for (const keyword of SUBSCRIPTION_KEYWORDS) {
    if (message.includes(keyword)) {
      return { category: 'subscription', matchedMerchant: parsed.merchant || null, confidence: 0.7 };
    }
  }

  return { category: null, matchedMerchant: null, confidence: 0 };
}

// ─── Auto-Matching ─────────────────────────────────────────────────────────

/** Normalize a name for fuzzy matching */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Check if two names are similar enough to be the same entity */
function namesMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Check if one is a known alias of the other
  const aliasA = normalize(SUBSCRIPTION_MERCHANTS[a.toLowerCase()] || a);
  const aliasB = normalize(SUBSCRIPTION_MERCHANTS[b.toLowerCase()] || b);
  return aliasA === aliasB || aliasA.includes(aliasB) || aliasB.includes(aliasA);
}

/** Calculate next billing date from current date */
function calcNextBillingDate(billingDay: number, cycle: 'monthly' | 'yearly'): string {
  const now = new Date();
  const day = Math.min(billingDay, 28);

  if (cycle === 'monthly') {
    let next = new Date(now.getFullYear(), now.getMonth(), day);
    if (next <= now) {
      next = new Date(now.getFullYear(), now.getMonth() + 1, day);
    }
    return next.toISOString().slice(0, 10);
  } else {
    let next = new Date(now.getFullYear(), now.getMonth(), day);
    if (next <= now) {
      next = new Date(now.getFullYear() + 1, now.getMonth(), day);
    }
    return next.toISOString().slice(0, 10);
  }
}

/**
 * When a transaction comes in, try to match it to an existing subscription/EMI/investment.
 * If matched, update the next billing date and confirm it's active.
 * If not matched but classified, create a pending suggestion.
 *
 * Returns what was matched/suggested so the caller can notify the user.
 */
export async function processTransactionForTracking(
  parsed: ParsedTransaction,
): Promise<{
  matched: boolean;
  type: TransactionCategory;
  itemName: string | null;
  isNew: boolean; // true = new suggestion created
  suggestedItemId: string | null;
}> {
  const classification = classifyTransaction(parsed);

  if (!classification.category) {
    return { matched: false, type: null, itemName: null, isNew: false, suggestedItemId: null };
  }

  const merchantName = classification.matchedMerchant || parsed.merchant || 'Unknown';
  const today = new Date();
  const billingDay = today.getDate();

  if (classification.category === 'subscription') {
    return await matchOrCreateSubscription(parsed, merchantName, billingDay, classification.confidence);
  } else if (classification.category === 'investment') {
    return await matchOrCreateInvestment(parsed, merchantName, billingDay, classification.confidence);
  } else if (classification.category === 'emi') {
    return await matchOrCreateEMI(parsed, merchantName, billingDay, classification.confidence);
  }

  return { matched: false, type: null, itemName: null, isNew: false, suggestedItemId: null };
}

// ─── Subscription Matching ─────────────────────────────────────────────────

async function matchOrCreateSubscription(
  parsed: ParsedTransaction,
  merchantName: string,
  billingDay: number,
  confidence: number,
): Promise<{ matched: boolean; type: TransactionCategory; itemName: string | null; isNew: boolean; suggestedItemId: string | null }> {
  const existing = await getSubscriptions();

  // Try to match by name
  const match = existing.find(s => s.active && namesMatch(s.name, merchantName));

  if (match) {
    // Update existing subscription
    const amountChanged = Math.abs(match.amount - parsed.amount) > 1;
    match.nextBillingDate = calcNextBillingDate(billingDay, match.cycle);
    match.billingDay = billingDay;
    match.confirmed = true;

    // Handle amount change (price increase/decrease)
    if (amountChanged) {
      match.amount = parsed.amount;
    }

    // Handle shared subscription: mark that we paid this cycle
    if (match.isShared) {
      // Store that current user paid this billing cycle
      await setSharedPaymentRecord(match.id, today().toISOString().slice(0, 7)); // YYYY-MM
    }

    await saveSubscription(match);
    return { matched: true, type: 'subscription', itemName: match.name, isNew: false, suggestedItemId: null };
  }

  // No match — create suggestion (unconfirmed)
  if (confidence >= 0.7) {
    const newItem: UserSubscriptionItem = {
      id: generateId(),
      name: merchantName,
      amount: parsed.amount,
      cycle: 'monthly', // default assumption
      billingDay,
      nextBillingDate: calcNextBillingDate(billingDay, 'monthly'),
      isShared: false,
      source: 'auto',
      confirmed: false, // needs user confirmation
      active: true,
      createdAt: Date.now(),
    };
    await saveSubscription(newItem);
    return { matched: false, type: 'subscription', itemName: merchantName, isNew: true, suggestedItemId: newItem.id };
  }

  return { matched: false, type: 'subscription', itemName: null, isNew: false, suggestedItemId: null };
}

// ─── Investment Matching ───────────────────────────────────────────────────

async function matchOrCreateInvestment(
  parsed: ParsedTransaction,
  merchantName: string,
  billingDay: number,
  confidence: number,
): Promise<{ matched: boolean; type: TransactionCategory; itemName: string | null; isNew: boolean; suggestedItemId: string | null }> {
  const existing = await getInvestments();

  const match = existing.find(i => i.active && namesMatch(i.name, merchantName));

  if (match) {
    if (match.cycle !== 'one-time' && match.billingDay) {
      match.nextBillingDate = calcNextBillingDate(match.billingDay, match.cycle === 'monthly' ? 'monthly' : 'yearly');
    }
    // Update amount if changed (variable SIPs)
    if (Math.abs(match.amount - parsed.amount) > 1) {
      match.amount = parsed.amount;
    }
    match.confirmed = true;
    await saveInvestment(match);
    return { matched: true, type: 'investment', itemName: match.name, isNew: false, suggestedItemId: null };
  }

  if (confidence >= 0.7) {
    const newItem: InvestmentItem = {
      id: generateId(),
      name: merchantName,
      amount: parsed.amount,
      cycle: 'monthly',
      billingDay,
      nextBillingDate: calcNextBillingDate(billingDay, 'monthly'),
      source: 'auto',
      confirmed: false,
      active: true,
      createdAt: Date.now(),
    };
    await saveInvestment(newItem);
    return { matched: false, type: 'investment', itemName: merchantName, isNew: true, suggestedItemId: newItem.id };
  }

  return { matched: false, type: 'investment', itemName: null, isNew: false, suggestedItemId: null };
}

// ─── EMI Matching ──────────────────────────────────────────────────────────

async function matchOrCreateEMI(
  parsed: ParsedTransaction,
  merchantName: string,
  billingDay: number,
  confidence: number,
): Promise<{ matched: boolean; type: TransactionCategory; itemName: string | null; isNew: boolean; suggestedItemId: string | null }> {
  const existing = await getEMIs();

  // Match by name OR by similar amount on similar billing day
  const match = existing.find(e => {
    if (!e.active) return false;
    if (namesMatch(e.name, merchantName)) return true;
    // Also match by amount + billing day proximity (EMIs are fixed amounts)
    const amountClose = Math.abs(e.amount - parsed.amount) < 5; // within ₹5
    const dayClose = Math.abs(e.billingDay - billingDay) <= 2; // within 2 days
    return amountClose && dayClose;
  });

  if (match) {
    // Update EMI — increment months paid
    match.monthsPaid = Math.min(match.monthsPaid + 1, match.totalMonths);
    match.monthsLeft = Math.max(match.totalMonths - match.monthsPaid, 0);
    match.nextBillingDate = calcNextBillingDate(match.billingDay, 'monthly');
    match.confirmed = true;

    // Auto-deactivate if all months paid
    if (match.monthsLeft === 0) {
      match.active = false;
    }

    await saveEMI(match);
    return { matched: true, type: 'emi', itemName: match.name, isNew: false, suggestedItemId: null };
  }

  if (confidence >= 0.8) { // Higher threshold for EMIs since we need user to fill months
    const newItem: EMIItem = {
      id: generateId(),
      name: merchantName,
      amount: parsed.amount,
      totalMonths: 0, // user needs to fill this
      monthsPaid: 1,
      monthsLeft: 0,
      billingDay,
      nextBillingDate: calcNextBillingDate(billingDay, 'monthly'),
      source: 'auto',
      confirmed: false,
      active: true,
      createdAt: Date.now(),
    };
    await saveEMI(newItem);
    return { matched: false, type: 'emi', itemName: merchantName, isNew: true, suggestedItemId: newItem.id };
  }

  return { matched: false, type: 'emi', itemName: null, isNew: false, suggestedItemId: null };
}

// ─── Shared Subscription Logic ─────────────────────────────────────────────

const SHARED_PAYMENTS_KEY = '@et_shared_payments';

interface SharedPaymentRecord {
  subscriptionId: string;
  billingMonth: string; // YYYY-MM
  paidByUser: boolean;
  timestamp: number;
}

function today(): Date {
  return new Date();
}

async function getSharedPayments(): Promise<SharedPaymentRecord[]> {
  const raw = await AsyncStorage.getItem(SHARED_PAYMENTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function setSharedPaymentRecord(subscriptionId: string, billingMonth: string): Promise<void> {
  const records = await getSharedPayments();
  // Remove old record for same sub + month if exists
  const filtered = records.filter(r => !(r.subscriptionId === subscriptionId && r.billingMonth === billingMonth));
  filtered.push({
    subscriptionId,
    billingMonth,
    paidByUser: true,
    timestamp: Date.now(),
  });
  await AsyncStorage.setItem(SHARED_PAYMENTS_KEY, JSON.stringify(filtered));
}

/**
 * Check if a shared subscription was paid by the user this month.
 * If not, it means someone else may have paid.
 */
export async function checkSharedSubscriptionStatus(subscriptionId: string): Promise<{
  paidByUser: boolean;
  lastPaidMonth: string | null;
}> {
  const records = await getSharedPayments();
  const currentMonth = today().toISOString().slice(0, 7);
  const thisMonthRecord = records.find(
    r => r.subscriptionId === subscriptionId && r.billingMonth === currentMonth,
  );

  // Find last time user paid
  const userRecords = records
    .filter(r => r.subscriptionId === subscriptionId && r.paidByUser)
    .sort((a, b) => b.timestamp - a.timestamp);

  return {
    paidByUser: !!thisMonthRecord,
    lastPaidMonth: userRecords.length > 0 ? userRecords[0].billingMonth : null,
  };
}

// ─── Recurring Pattern Detection (connects existing RecurringService) ──────

/**
 * Analyze transaction history to find potential subscriptions/investments/EMIs
 * that haven't been tracked yet.
 *
 * This runs on app startup or manual sync and suggests new items.
 */
export async function detectUntracked(
  transactions: Transaction[],
): Promise<{
  subscriptions: Array<{ name: string; amount: number; frequency: 'monthly' | 'weekly'; occurrences: number }>;
  emis: Array<{ name: string; amount: number; occurrences: number }>;
  investments: Array<{ name: string; amount: number; occurrences: number }>;
}> {
  const existingSubs = await getSubscriptions();
  const existingInv = await getInvestments();
  const existingEMIs = await getEMIs();

  // Group transactions by normalized merchant
  const groups: Record<string, Transaction[]> = {};
  for (const txn of transactions) {
    const key = normalize(txn.merchant || txn.description);
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(txn);
  }

  const suggestedSubs: Array<{ name: string; amount: number; frequency: 'monthly' | 'weekly'; occurrences: number }> = [];
  const suggestedEMIs: Array<{ name: string; amount: number; occurrences: number }> = [];
  const suggestedInvestments: Array<{ name: string; amount: number; occurrences: number }> = [];

  for (const [key, txns] of Object.entries(groups)) {
    if (txns.length < 2) continue; // Need at least 2 occurrences

    const sorted = txns.sort((a, b) => a.timestamp - b.timestamp);
    const displayName = txns[0].merchant || txns[0].description;

    // Check if already tracked
    const isTrackedSub = existingSubs.some(s => namesMatch(s.name, displayName));
    const isTrackedInv = existingInv.some(i => namesMatch(i.name, displayName));
    const isTrackedEMI = existingEMIs.some(e => namesMatch(e.name, displayName));
    if (isTrackedSub || isTrackedInv || isTrackedEMI) continue;

    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days = (sorted[i].timestamp - sorted[i - 1].timestamp) / (1000 * 60 * 60 * 24);
      intervals.push(days);
    }

    if (intervals.length === 0) continue;

    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const avgAmount = txns.reduce((s, t) => s + t.amount, 0) / txns.length;

    // Check regularity
    const variance = intervals.reduce((s, v) => s + Math.pow(v - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = avgInterval > 0 ? stdDev / avgInterval : Infinity;

    if (cv > 0.5) continue; // Too irregular

    // Classify the pattern
    const classification = classifyTransaction({
      amount: avgAmount,
      type: 'debit',
      merchant: displayName,
      rawMessage: displayName, // Use merchant name for keyword matching
      timestamp: Date.now(),
    });

    if (classification.category === 'emi') {
      suggestedEMIs.push({ name: displayName, amount: Math.round(avgAmount), occurrences: txns.length });
    } else if (classification.category === 'investment') {
      suggestedInvestments.push({ name: displayName, amount: Math.round(avgAmount), occurrences: txns.length });
    } else if (avgInterval >= 25 && avgInterval <= 35) {
      // Monthly pattern → likely subscription
      suggestedSubs.push({ name: displayName, amount: Math.round(avgAmount * 100) / 100, frequency: 'monthly', occurrences: txns.length });
    } else if (avgInterval >= 5 && avgInterval <= 10) {
      // Weekly pattern → could be subscription
      suggestedSubs.push({ name: displayName, amount: Math.round(avgAmount * 100) / 100, frequency: 'weekly', occurrences: txns.length });
    }
  }

  return {
    subscriptions: suggestedSubs.sort((a, b) => b.occurrences - a.occurrences),
    emis: suggestedEMIs.sort((a, b) => b.occurrences - a.occurrences),
    investments: suggestedInvestments.sort((a, b) => b.occurrences - a.occurrences),
  };
}

// ─── EMI Completion Check ──────────────────────────────────────────────────

/**
 * Check all EMIs and deactivate completed ones.
 * Should run on app startup.
 */
export async function checkEMICompletions(): Promise<string[]> {
  const emis = await getEMIs();
  const completed: string[] = [];

  for (const emi of emis) {
    if (emi.active && emi.monthsLeft <= 0 && emi.totalMonths > 0) {
      emi.active = false;
      await saveEMI(emi);
      completed.push(emi.name);
    }
  }

  return completed;
}

// ─── Subscription Overdue Check ────────────────────────────────────────────

/**
 * Check for subscriptions that are past their billing date.
 * For shared subscriptions, this means someone else may have paid.
 */
export async function checkOverdueSubscriptions(): Promise<Array<{
  subscription: UserSubscriptionItem;
  daysPastDue: number;
  possiblyPaidByOther: boolean;
}>> {
  const subs = await getSubscriptions();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const overdue: Array<{
    subscription: UserSubscriptionItem;
    daysPastDue: number;
    possiblyPaidByOther: boolean;
  }> = [];

  for (const sub of subs) {
    if (!sub.active || !sub.confirmed) continue;

    const billingDate = new Date(sub.nextBillingDate + 'T00:00:00');
    if (billingDate < now) {
      const daysPastDue = Math.ceil((now.getTime() - billingDate.getTime()) / (1000 * 60 * 60 * 24));

      // For shared subscriptions, check if someone else might have paid
      let possiblyPaidByOther = false;
      if (sub.isShared && daysPastDue >= 3) {
        const status = await checkSharedSubscriptionStatus(sub.id);
        possiblyPaidByOther = !status.paidByUser;
      }

      overdue.push({ subscription: sub, daysPastDue, possiblyPaidByOther });
    }
  }

  return overdue;
}
