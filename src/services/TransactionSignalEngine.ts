/**
 * Transaction Signal Engine
 *
 * Unified pipeline that all transaction sources feed into:
 *   SMS (Android) -> Engine -> Deduplicate -> Route to tracker
 *   Email (All)   -> Engine -> Deduplicate -> Route to tracker
 *   Shortcuts (iOS)-> Engine -> Deduplicate -> Route to tracker
 *   Manual input   -> Engine -> (no dedup)  -> Route to tracker
 *   Quick Widget   -> Engine -> (no dedup)  -> Route to tracker
 *
 * Features:
 * - Cross-source deduplication (same amount + ~60s window = likely duplicate)
 * - Confidence scoring (multiple sources confirming = high confidence)
 * - Source priority (SMS > Email > Shortcut for dedup winner)
 * - Pending transaction queue for nightly review
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParsedTransaction } from '../models/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TransactionSource =
  | 'sms'
  | 'email'
  | 'shortcut'
  | 'manual'
  | 'widget'
  | 'deep_link';

export interface TransactionSignal {
  parsed: ParsedTransaction;
  source: TransactionSource;
  receivedAt: number;
  fingerprint: string;
  confidence: number; // 0.0 - 1.0
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingSignal?: TransactionSignal;
  mergedConfidence: number;
}

interface PendingReviewTransaction {
  id: string;
  parsed: ParsedTransaction;
  source: TransactionSource;
  receivedAt: number;
  reviewed: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEDUP_WINDOW_MS = 60_000; // 60 seconds
const DEDUP_AMOUNT_TOLERANCE = 0.01; // ₹0.01 tolerance for floating point
const MAX_RECENT_SIGNALS = 50;
const PENDING_REVIEW_KEY = '@et_pending_review';

// Source priority for dedup (higher = preferred)
const SOURCE_PRIORITY: Record<TransactionSource, number> = {
  sms: 5,
  email: 4,
  shortcut: 3,
  deep_link: 2,
  widget: 1,
  manual: 0, // Manual entries are never deduplicated
};

// Confidence by source
const SOURCE_CONFIDENCE: Record<TransactionSource, number> = {
  sms: 0.95,
  email: 0.90,
  shortcut: 0.80,
  deep_link: 0.75,
  widget: 0.60,
  manual: 1.0, // User entered = always trusted
};

// ─── Engine State ───────────────────────────────────────────────────────────

let recentSignals: TransactionSignal[] = [];
let onTransactionCallback: ((signal: TransactionSignal) => void) | null = null;

// ─── Fingerprinting ─────────────────────────────────────────────────────────

/**
 * Generate a fingerprint for deduplication.
 * Two transactions match if same amount within the time window.
 * Optionally also matches on merchant if available.
 */
function generateFingerprint(parsed: ParsedTransaction): string {
  const amount = Math.round(parsed.amount * 100); // normalize to paise
  const merchant = (parsed.merchant || '').toLowerCase().replace(/\s+/g, '');
  return `${amount}_${merchant}`;
}

// ─── Deduplication ──────────────────────────────────────────────────────────

function checkDuplicate(signal: TransactionSignal): DeduplicationResult {
  // Manual and widget entries are never deduplicated
  if (signal.source === 'manual' || signal.source === 'widget') {
    return { isDuplicate: false, mergedConfidence: signal.confidence };
  }

  const now = signal.receivedAt;
  const cutoff = now - DEDUP_WINDOW_MS;

  // Clean old signals
  recentSignals = recentSignals.filter(s => s.receivedAt > cutoff);

  // Find matching signal
  for (const existing of recentSignals) {
    const amountMatch = Math.abs(existing.parsed.amount - signal.parsed.amount) <= DEDUP_AMOUNT_TOLERANCE;
    const timeMatch = Math.abs(existing.receivedAt - signal.receivedAt) <= DEDUP_WINDOW_MS;

    if (amountMatch && timeMatch) {
      // Same transaction detected from multiple sources
      // Merge confidence: multiple confirmations increase confidence
      const mergedConfidence = Math.min(
        1.0,
        existing.confidence + signal.confidence * 0.3,
      );

      // Update existing signal's confidence
      existing.confidence = mergedConfidence;

      // If new source has higher priority, update the signal data
      if (SOURCE_PRIORITY[signal.source] > SOURCE_PRIORITY[existing.source]) {
        existing.parsed = signal.parsed;
        existing.source = signal.source;
      }

      return {
        isDuplicate: true,
        existingSignal: existing,
        mergedConfidence,
      };
    }
  }

  return { isDuplicate: false, mergedConfidence: signal.confidence };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Register a callback for when a new (non-duplicate) transaction arrives.
 */
export function registerTransactionHandler(
  callback: (signal: TransactionSignal) => void,
): () => void {
  onTransactionCallback = callback;
  return () => { onTransactionCallback = null; };
}

/**
 * Ingest a transaction from any source.
 * Deduplicates and routes to the registered handler.
 * Returns the signal if it was new, null if duplicate.
 */
export function ingestTransaction(
  parsed: ParsedTransaction,
  source: TransactionSource,
): TransactionSignal | null {
  const signal: TransactionSignal = {
    parsed,
    source,
    receivedAt: Date.now(),
    fingerprint: generateFingerprint(parsed),
    confidence: SOURCE_CONFIDENCE[source],
  };

  const dedupResult = checkDuplicate(signal);

  if (dedupResult.isDuplicate) {
    // Transaction already processed from another source
    console.log(
      `[SignalEngine] Duplicate detected: ${parsed.amount} from ${source}` +
      ` (already from ${dedupResult.existingSignal?.source})`,
    );
    return null;
  }

  // New transaction — add to recent signals
  recentSignals.push(signal);
  if (recentSignals.length > MAX_RECENT_SIGNALS) {
    recentSignals = recentSignals.slice(-MAX_RECENT_SIGNALS);
  }

  // Route to handler
  if (onTransactionCallback) {
    onTransactionCallback(signal);
  }

  return signal;
}

// ─── Pending Review Queue (for Nightly Review) ─────────────────────────────

/**
 * Add a transaction to the pending review queue.
 * These are transactions that were detected but not yet assigned to a tracker.
 */
export async function addToPendingReview(
  parsed: ParsedTransaction,
  source: TransactionSource,
): Promise<void> {
  const pending = await getPendingReviewTransactions();
  const entry: PendingReviewTransaction = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    parsed,
    source,
    receivedAt: Date.now(),
    reviewed: false,
  };
  pending.push(entry);
  await AsyncStorage.setItem(PENDING_REVIEW_KEY, JSON.stringify(pending));
}

/**
 * Get all unreviewed transactions for nightly review.
 */
export async function getPendingReviewTransactions(): Promise<PendingReviewTransaction[]> {
  const raw = await AsyncStorage.getItem(PENDING_REVIEW_KEY);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Get today's unreviewed transactions count.
 */
export async function getTodayPendingCount(): Promise<number> {
  const pending = await getPendingReviewTransactions();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return pending.filter(
    p => !p.reviewed && p.receivedAt >= todayStart.getTime(),
  ).length;
}

/**
 * Mark transactions as reviewed.
 */
export async function markAsReviewed(ids: string[]): Promise<void> {
  const pending = await getPendingReviewTransactions();
  const idSet = new Set(ids);
  for (const p of pending) {
    if (idSet.has(p.id)) {
      p.reviewed = true;
    }
  }
  await AsyncStorage.setItem(PENDING_REVIEW_KEY, JSON.stringify(pending));
}

/**
 * Clear old reviewed transactions (older than 7 days).
 */
export async function cleanupOldPending(): Promise<void> {
  const pending = await getPendingReviewTransactions();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const cleaned = pending.filter(
    p => !p.reviewed || p.receivedAt > cutoff,
  );
  await AsyncStorage.setItem(PENDING_REVIEW_KEY, JSON.stringify(cleaned));
}

/**
 * Get engine stats for debugging/display.
 */
export function getEngineStats(): {
  recentSignalCount: number;
  sources: Record<TransactionSource, number>;
} {
  const sources: Record<TransactionSource, number> = {
    sms: 0, email: 0, shortcut: 0, manual: 0, widget: 0, deep_link: 0,
  };
  for (const s of recentSignals) {
    sources[s.source]++;
  }
  return {
    recentSignalCount: recentSignals.length,
    sources,
  };
}
