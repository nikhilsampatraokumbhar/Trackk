/**
 * Auto-Detection Service for Subscriptions, Investments, and EMIs
 *
 * This service:
 * 1. Classifies incoming transactions as subscription/EMI/investment based on SMS keywords + merchant
 * 2. Auto-matches incoming transactions to existing tracked items (updates next billing date, amount)
 * 3. Historical SMS scan for one-time sync (reads 1 year of SMS to bootstrap tracking)
 * 4. Handles shared subscription logic (someone else paying this month)
 * 5. Handles EMI completion with celebration (auto-deactivate when all months paid)
 * 6. Detects overdue/missed subscriptions and prompts user
 * 7. Supports yearly pattern detection for annual subscriptions
 * 8. Handles variable SIP amounts (auto-updates amount on match)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { ParsedTransaction, UserSubscriptionItem, InvestmentItem, EMIItem, Transaction } from '../models/types';
import {
  getSubscriptions, saveSubscription,
  getInvestments, saveInvestment,
  getEMIs, saveEMI,
  getTransactions,
} from './StorageService';
import { isBankSender, parseTransactionSms } from './TransactionParser';
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
  const aliasA = normalize(SUBSCRIPTION_MERCHANTS[a.toLowerCase()] || INVESTMENT_MERCHANTS[a.toLowerCase()] || a);
  const aliasB = normalize(SUBSCRIPTION_MERCHANTS[b.toLowerCase()] || INVESTMENT_MERCHANTS[b.toLowerCase()] || b);
  return aliasA === aliasB || aliasA.includes(aliasB) || aliasB.includes(aliasA);
}

/** Calculate next billing date from current date */
function calcNextBillingDate(billingDay: number, cycle: 'monthly' | 'yearly'): string {
  const now = new Date();

  if (cycle === 'monthly') {
    // Use the actual billing day; JS Date handles overflow (e.g. day 31 in a 30-day month → next month 1st)
    // But we want to clamp to end of month, so check actual days in month
    const nextMonth0 = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInThisMonth = new Date(nextMonth0.getFullYear(), nextMonth0.getMonth() + 1, 0).getDate();
    const dayThisMonth = Math.min(billingDay, daysInThisMonth);
    let next = new Date(now.getFullYear(), now.getMonth(), dayThisMonth);
    if (next <= now) {
      const daysInNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
      const dayNextMonth = Math.min(billingDay, daysInNextMonth);
      next = new Date(now.getFullYear(), now.getMonth() + 1, dayNextMonth);
    }
    return next.toISOString().slice(0, 10);
  } else {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const day = Math.min(billingDay, daysInMonth);
    let next = new Date(now.getFullYear(), now.getMonth(), day);
    if (next <= now) {
      const daysInFutureMonth = new Date(now.getFullYear() + 1, now.getMonth() + 1, 0).getDate();
      const dayFuture = Math.min(billingDay, daysInFutureMonth);
      next = new Date(now.getFullYear() + 1, now.getMonth(), dayFuture);
    }
    return next.toISOString().slice(0, 10);
  }
}

/**
 * When a transaction comes in, try to match it to an existing subscription/EMI/investment.
 * If matched, update the next billing date, amount (if changed), and confirm it's active.
 * If not matched but classified, create a pending suggestion.
 */
export async function processTransactionForTracking(
  parsed: ParsedTransaction,
): Promise<{
  matched: boolean;
  type: TransactionCategory;
  itemName: string | null;
  isNew: boolean;
  suggestedItemId: string | null;
  emiCompleted?: boolean; // true if EMI just hit 0 months left
}> {
  const classification = classifyTransaction(parsed);

  if (!classification.category) {
    return { matched: false, type: null, itemName: null, isNew: false, suggestedItemId: null };
  }

  const merchantName = classification.matchedMerchant || parsed.merchant || 'Unknown';
  const txnDate = new Date(parsed.timestamp);
  const billingDay = txnDate.getDate();

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
    // Update existing subscription — amount, billing day, next date
    const amountChanged = Math.abs(match.amount - parsed.amount) > 1;
    match.nextBillingDate = calcNextBillingDate(billingDay, match.cycle);
    match.billingDay = billingDay;
    match.confirmed = true;

    // Handle amount change (price increase/decrease — e.g. Netflix 199 → 249)
    if (amountChanged) {
      match.amount = parsed.amount;
    }

    // Handle shared subscription: mark that we paid this cycle
    if (match.isShared) {
      const month = new Date(parsed.timestamp).toISOString().slice(0, 7);
      await setSharedPaymentRecord(match.id, month);
    }

    await saveSubscription(match);
    return { matched: true, type: 'subscription', itemName: match.name, isNew: false, suggestedItemId: null };
  }

  // No match — create suggestion (unconfirmed)
  if (confidence >= 0.7) {
    // Check if we already have an unconfirmed suggestion for this name
    const existingUnconfirmed = existing.find(s => !s.confirmed && namesMatch(s.name, merchantName));
    if (existingUnconfirmed) {
      // Update existing unconfirmed — don't create duplicates
      existingUnconfirmed.amount = parsed.amount;
      existingUnconfirmed.billingDay = billingDay;
      existingUnconfirmed.nextBillingDate = calcNextBillingDate(billingDay, 'monthly');
      await saveSubscription(existingUnconfirmed);
      return { matched: false, type: 'subscription', itemName: merchantName, isNew: false, suggestedItemId: existingUnconfirmed.id };
    }

    const newItem: UserSubscriptionItem = {
      id: generateId(),
      name: merchantName,
      amount: parsed.amount,
      cycle: 'monthly',
      billingDay,
      nextBillingDate: calcNextBillingDate(billingDay, 'monthly'),
      isShared: false,
      source: 'auto',
      confirmed: false,
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
      match.billingDay = billingDay;
      match.nextBillingDate = calcNextBillingDate(billingDay, match.cycle === 'monthly' ? 'monthly' : 'yearly');
    }
    // Update amount (variable SIPs — ₹5000 one month, ₹10000 next)
    match.amount = parsed.amount;
    match.confirmed = true;
    await saveInvestment(match);
    return { matched: true, type: 'investment', itemName: match.name, isNew: false, suggestedItemId: null };
  }

  if (confidence >= 0.7) {
    // Check for existing unconfirmed
    const existingUnconfirmed = existing.find(i => !i.confirmed && namesMatch(i.name, merchantName));
    if (existingUnconfirmed) {
      existingUnconfirmed.amount = parsed.amount;
      existingUnconfirmed.billingDay = billingDay;
      existingUnconfirmed.nextBillingDate = calcNextBillingDate(billingDay, 'monthly');
      await saveInvestment(existingUnconfirmed);
      return { matched: false, type: 'investment', itemName: merchantName, isNew: false, suggestedItemId: existingUnconfirmed.id };
    }

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
): Promise<{ matched: boolean; type: TransactionCategory; itemName: string | null; isNew: boolean; suggestedItemId: string | null; emiCompleted?: boolean }> {
  const existing = await getEMIs();

  // Match by name OR by similar amount on similar billing day
  const match = existing.find(e => {
    if (!e.active) return false;
    if (namesMatch(e.name, merchantName)) return true;
    // Also match by amount + billing day proximity (EMIs are fixed amounts)
    const amountClose = Math.abs(e.amount - parsed.amount) < 5;
    const dayClose = Math.abs(e.billingDay - billingDay) <= 2;
    return amountClose && dayClose;
  });

  if (match) {
    // Update EMI — increment months paid
    match.monthsPaid = Math.min(match.monthsPaid + 1, match.totalMonths);
    match.monthsLeft = Math.max(match.totalMonths - match.monthsPaid, 0);
    match.nextBillingDate = calcNextBillingDate(match.billingDay, 'monthly');
    match.confirmed = true;

    let emiCompleted = false;
    // Auto-deactivate if all months paid
    if (match.monthsLeft === 0 && match.totalMonths > 0) {
      match.active = false;
      emiCompleted = true;
    }

    await saveEMI(match);
    return { matched: true, type: 'emi', itemName: match.name, isNew: false, suggestedItemId: null, emiCompleted };
  }

  if (confidence >= 0.8) {
    // Check for existing unconfirmed
    const existingUnconfirmed = existing.find(e => !e.confirmed && namesMatch(e.name, merchantName));
    if (existingUnconfirmed) {
      existingUnconfirmed.monthsPaid += 1;
      existingUnconfirmed.amount = parsed.amount;
      await saveEMI(existingUnconfirmed);
      return { matched: false, type: 'emi', itemName: merchantName, isNew: false, suggestedItemId: existingUnconfirmed.id };
    }

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

async function getSharedPayments(): Promise<SharedPaymentRecord[]> {
  const raw = await AsyncStorage.getItem(SHARED_PAYMENTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function setSharedPaymentRecord(subscriptionId: string, billingMonth: string): Promise<void> {
  const records = await getSharedPayments();
  const filtered = records.filter(r => !(r.subscriptionId === subscriptionId && r.billingMonth === billingMonth));
  filtered.push({
    subscriptionId,
    billingMonth,
    paidByUser: true,
    timestamp: Date.now(),
  });
  await AsyncStorage.setItem(SHARED_PAYMENTS_KEY, JSON.stringify(filtered));
}

export async function checkSharedSubscriptionStatus(subscriptionId: string): Promise<{
  paidByUser: boolean;
  lastPaidMonth: string | null;
}> {
  const records = await getSharedPayments();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonthRecord = records.find(
    r => r.subscriptionId === subscriptionId && r.billingMonth === currentMonth,
  );

  const userRecords = records
    .filter(r => r.subscriptionId === subscriptionId && r.paidByUser)
    .sort((a, b) => b.timestamp - a.timestamp);

  return {
    paidByUser: !!thisMonthRecord,
    lastPaidMonth: userRecords.length > 0 ? userRecords[0].billingMonth : null,
  };
}

// ─── Historical SMS Scan (One-Time Sync) ───────────────────────────────────

export interface ScanResult {
  subscriptions: UserSubscriptionItem[];
  investments: InvestmentItem[];
  emis: EMIItem[];
  totalSmsScanned: number;
  totalMatched: number;
}

/**
 * Scan historical SMS messages (up to 1 year back) to detect subscriptions,
 * investments, and EMIs. Creates unconfirmed items for each detected pattern.
 *
 * @param filter 'all' | 'subscriptions' | 'investments' | 'emis' — which category to scan for
 */
export async function scanHistoricalSMS(
  filter: 'all' | 'subscriptions' | 'investments' | 'emis' = 'all',
): Promise<ScanResult> {
  const result: ScanResult = {
    subscriptions: [],
    investments: [],
    emis: [],
    totalSmsScanned: 0,
    totalMatched: 0,
  };

  // Try native SMS scan first (Android only)
  let parsed: Array<{ txn: ParsedTransaction; date: number }> = [];

  if (Platform.OS === 'android' && NativeModules.SmsAndroid) {
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);

    const messages = await new Promise<Array<{ body: string; address: string; date: string }>>((resolve) => {
      const smsFilter = {
        box: 'inbox',
        maxCount: 5000,
        minDate: oneYearAgo,
      };

      NativeModules.SmsAndroid.list(
        JSON.stringify(smsFilter),
        (_fail: string) => resolve([]),
        (_count: number, smsList: string) => {
          try {
            resolve(JSON.parse(smsList));
          } catch {
            resolve([]);
          }
        },
      );
    });

    result.totalSmsScanned = messages.length;

    for (const sms of messages) {
      if (!isBankSender(sms.address)) continue;
      const p = parseTransactionSms(sms.body, sms.address);
      if (p) {
        p.timestamp = parseInt(sms.date, 10);
        p.rawMessage = sms.body;
        parsed.push({ txn: p, date: parseInt(sms.date, 10) });
      }
    }
  }

  // Fallback: use stored transactions when native SMS is unavailable or returned nothing
  if (parsed.length === 0) {
    const storedResult = await scanFromStoredTransactions(filter);
    return storedResult;
  }

  // Group by classification and merchant
  return await groupAndSaveDetections(parsed, filter, result);
}

/**
 * Fallback scanner that uses already-stored transactions from the app's local storage.
 * Works on both iOS and Android — doesn't require SMS permission.
 * Analyzes transaction history by merchant name and keywords to detect patterns.
 */
export async function scanFromStoredTransactions(
  filter: 'all' | 'subscriptions' | 'investments' | 'emis' = 'all',
): Promise<ScanResult> {
  const result: ScanResult = {
    subscriptions: [],
    investments: [],
    emis: [],
    totalSmsScanned: 0,
    totalMatched: 0,
  };

  // Get all stored transactions (personal + reimbursement — no group)
  const allTransactions = await getTransactions();
  result.totalSmsScanned = allTransactions.length;

  if (allTransactions.length === 0) {
    return result;
  }

  // Convert Transaction[] to ParsedTransaction[] for classification
  const parsed: Array<{ txn: ParsedTransaction; date: number }> = [];

  for (const txn of allTransactions) {
    const p: ParsedTransaction = {
      amount: txn.amount,
      type: 'debit',
      merchant: txn.merchant || txn.description,
      rawMessage: txn.rawMessage || txn.description || txn.merchant || '',
      timestamp: txn.timestamp,
      bank: txn.source,
    };
    parsed.push({ txn: p, date: txn.timestamp });
  }

  return await groupAndSaveDetections(parsed, filter, result);
}

/**
 * Shared logic: group parsed transactions by classification, detect patterns, and save.
 */
async function groupAndSaveDetections(
  parsed: Array<{ txn: ParsedTransaction; date: number }>,
  filter: 'all' | 'subscriptions' | 'investments' | 'emis',
  result: ScanResult,
): Promise<ScanResult> {
  interface DetectedGroup {
    category: TransactionCategory;
    merchantName: string;
    amounts: number[];
    dates: number[];
  }

  const groups: Record<string, DetectedGroup> = {};

  for (const { txn, date } of parsed) {
    const classification = classifyTransaction(txn);
    if (!classification.category) continue;
    if (filter !== 'all' && filter !== `${classification.category}s` as string) continue;

    const name = classification.matchedMerchant || txn.merchant || 'Unknown';
    const key = `${classification.category}_${normalize(name)}`;

    if (!groups[key]) {
      groups[key] = {
        category: classification.category,
        merchantName: name,
        amounts: [],
        dates: [],
      };
    }
    groups[key].amounts.push(txn.amount);
    groups[key].dates.push(date);
  }

  // Load existing items to avoid duplicates
  const existingSubs = await getSubscriptions();
  const existingInvs = await getInvestments();
  const existingEMIs = await getEMIs();

  for (const group of Object.values(groups)) {
    // Skip if already tracked
    const alreadyTracked =
      existingSubs.some(s => namesMatch(s.name, group.merchantName)) ||
      existingInvs.some(i => namesMatch(i.name, group.merchantName)) ||
      existingEMIs.some(e => namesMatch(e.name, group.merchantName));
    if (alreadyTracked) continue;

    const sortedDates = [...group.dates].sort((a, b) => a - b);
    const latestAmount = group.amounts[group.amounts.length - 1];
    const latestDate = new Date(sortedDates[sortedDates.length - 1]);
    const billingDay = latestDate.getDate();

    // Determine cycle from intervals
    let cycle: 'monthly' | 'yearly' = 'monthly';
    if (sortedDates.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < sortedDates.length; i++) {
        intervals.push((sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
      if (avgInterval > 300) {
        cycle = 'yearly';
      }
    }

    result.totalMatched++;

    if (group.category === 'subscription') {
      const item: UserSubscriptionItem = {
        id: generateId(),
        name: group.merchantName,
        amount: latestAmount,
        cycle,
        billingDay,
        nextBillingDate: calcNextBillingDate(billingDay, cycle),
        isShared: false,
        source: 'auto',
        confirmed: false,
        active: true,
        createdAt: Date.now(),
      };
      await saveSubscription(item);
      result.subscriptions.push(item);
    } else if (group.category === 'investment') {
      const item: InvestmentItem = {
        id: generateId(),
        name: group.merchantName,
        amount: latestAmount,
        cycle: cycle === 'yearly' ? 'yearly' : 'monthly',
        billingDay,
        nextBillingDate: calcNextBillingDate(billingDay, cycle),
        source: 'auto',
        confirmed: false,
        active: true,
        createdAt: Date.now(),
      };
      await saveInvestment(item);
      result.investments.push(item);
    } else if (group.category === 'emi') {
      const item: EMIItem = {
        id: generateId(),
        name: group.merchantName,
        amount: latestAmount,
        totalMonths: 0,
        monthsPaid: group.dates.length,
        monthsLeft: 0,
        billingDay,
        nextBillingDate: calcNextBillingDate(billingDay, 'monthly'),
        source: 'auto',
        confirmed: false,
        active: true,
        createdAt: Date.now(),
      };
      await saveEMI(item);
      result.emis.push(item);
    }
  }

  return result;
}

// ─── Recurring Pattern Detection ───────────────────────────────────────────

/**
 * Analyze transaction history to find potential subscriptions/investments/EMIs
 * that haven't been tracked yet. Supports weekly, monthly, and yearly patterns.
 */
export async function detectUntracked(
  transactions: Transaction[],
): Promise<{
  subscriptions: Array<{ name: string; amount: number; frequency: 'monthly' | 'weekly' | 'yearly'; occurrences: number }>;
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

  const suggestedSubs: Array<{ name: string; amount: number; frequency: 'monthly' | 'weekly' | 'yearly'; occurrences: number }> = [];
  const suggestedEMIs: Array<{ name: string; amount: number; occurrences: number }> = [];
  const suggestedInvestments: Array<{ name: string; amount: number; occurrences: number }> = [];

  for (const [_key, txns] of Object.entries(groups)) {
    if (txns.length < 2) continue;

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
      rawMessage: displayName,
      timestamp: Date.now(),
    });

    if (classification.category === 'emi') {
      suggestedEMIs.push({ name: displayName, amount: Math.round(avgAmount), occurrences: txns.length });
    } else if (classification.category === 'investment') {
      suggestedInvestments.push({ name: displayName, amount: Math.round(avgAmount), occurrences: txns.length });
    } else if (avgInterval >= 300 && avgInterval <= 400) {
      // Yearly pattern → annual subscription
      suggestedSubs.push({ name: displayName, amount: Math.round(avgAmount * 100) / 100, frequency: 'yearly', occurrences: txns.length });
    } else if (avgInterval >= 25 && avgInterval <= 35) {
      // Monthly pattern
      suggestedSubs.push({ name: displayName, amount: Math.round(avgAmount * 100) / 100, frequency: 'monthly', occurrences: txns.length });
    } else if (avgInterval >= 5 && avgInterval <= 10) {
      // Weekly pattern
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

export interface EMICompletionResult {
  name: string;
  totalMonths: number;
  amount: number;
}

/**
 * Check all EMIs and deactivate completed ones.
 * Returns completed EMI details for celebration UI.
 */
export async function checkEMICompletions(): Promise<EMICompletionResult[]> {
  const emis = await getEMIs();
  const completed: EMICompletionResult[] = [];

  for (const emi of emis) {
    if (emi.active && emi.monthsLeft <= 0 && emi.totalMonths > 0) {
      emi.active = false;
      await saveEMI(emi);
      completed.push({
        name: emi.name,
        totalMonths: emi.totalMonths,
        amount: emi.amount,
      });
    }
  }

  return completed;
}

// ─── Overdue / Missed Payment Detection ────────────────────────────────────

export interface OverdueSubscription {
  subscription: UserSubscriptionItem;
  daysPastDue: number;
  possiblyPaidByOther: boolean;
}

/**
 * Check for subscriptions that are past their billing date without a payment detected.
 * Returns overdue items for popup UI:
 * - "Netflix payment not detected" → Remove / Skip (push next billing date)
 */
export async function checkOverdueSubscriptions(): Promise<OverdueSubscription[]> {
  const subs = await getSubscriptions();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const overdue: OverdueSubscription[] = [];

  for (const sub of subs) {
    if (!sub.active || !sub.confirmed) continue;

    const billingDate = new Date(sub.nextBillingDate + 'T00:00:00');
    if (billingDate < now) {
      const daysPastDue = Math.ceil((now.getTime() - billingDate.getTime()) / (1000 * 60 * 60 * 24));

      // Only flag if 3+ days overdue (give some buffer)
      if (daysPastDue < 3) continue;

      let possiblyPaidByOther = false;
      if (sub.isShared) {
        const status = await checkSharedSubscriptionStatus(sub.id);
        possiblyPaidByOther = !status.paidByUser;
      }

      overdue.push({ subscription: sub, daysPastDue, possiblyPaidByOther });
    }
  }

  return overdue;
}

/**
 * Skip an overdue subscription — push next billing date forward
 */
export async function skipOverdueSubscription(subscriptionId: string): Promise<void> {
  const subs = await getSubscriptions();
  const sub = subs.find(s => s.id === subscriptionId);
  if (!sub) return;

  sub.nextBillingDate = calcNextBillingDate(sub.billingDay, sub.cycle);
  await saveSubscription(sub);
}

/**
 * Remove (deactivate) an overdue subscription
 */
export async function removeOverdueSubscription(subscriptionId: string): Promise<void> {
  const subs = await getSubscriptions();
  const sub = subs.find(s => s.id === subscriptionId);
  if (!sub) return;

  sub.active = false;
  await saveSubscription(sub);
}
