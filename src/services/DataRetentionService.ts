import AsyncStorage from '@react-native-async-storage/async-storage';
import { GroupTransaction } from '../models/types';
import { getGroupTransactions } from './StorageService';

// ─── Constants ──────────────────────────────────────────────────────────────

const RETENTION_DAYS = 90;
const WARNING_BANNER_DAY = 75;
const SOFT_ALERT_DAY = 85;

const KEYS = {
  BANNER_DISMISSED: '@et_retention_banner_dismissed', // JSON: { [groupId]: timestamp }
  SOFT_ALERT_SHOWN: '@et_retention_alert_shown',      // JSON: { [groupId]: timestamp }
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RetentionStatus {
  groupId: string;
  oldestTransactionAge: number; // in days
  expiringCount: number;        // transactions that will be locked at 90 days
  showBanner: boolean;          // true if oldest >= 75 days and banner not dismissed
  showSoftAlert: boolean;       // true if oldest >= 85 days and alert not yet shown
  daysUntilLock: number;        // days until oldest transaction gets locked
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysSinceTimestamp(timestamp: number): number {
  return Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
}

async function getJsonMap(key: string): Promise<Record<string, number>> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : {};
}

async function setJsonMap(key: string, map: Record<string, number>): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(map));
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Check whether a transaction is locked (older than 90 days, free user).
 */
export function isTransactionLocked(timestamp: number): boolean {
  return daysSinceTimestamp(timestamp) >= RETENTION_DAYS;
}

/**
 * Filter group transactions into visible vs locked for free users.
 * Premium users see everything; free users see all but locked ones are marked.
 */
export function partitionGroupTransactions(
  txns: GroupTransaction[],
): { visible: GroupTransaction[]; locked: GroupTransaction[] } {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const visible = txns.filter(t => t.timestamp >= cutoff);
  const locked = txns.filter(t => t.timestamp < cutoff);
  return { visible, locked };
}

/**
 * Check retention status for a specific group's transactions.
 * Returns info about whether banners/alerts should be shown.
 */
export async function checkGroupRetentionStatus(groupId: string): Promise<RetentionStatus | null> {
  const txns = await getGroupTransactions(groupId);
  if (txns.length === 0) return null;

  const oldest = Math.min(...txns.map(t => t.timestamp));
  const oldestAge = daysSinceTimestamp(oldest);

  if (oldestAge < WARNING_BANNER_DAY) return null;

  const expiringCount = txns.filter(t => daysSinceTimestamp(t.timestamp) >= WARNING_BANNER_DAY).length;

  // Check if banner was dismissed recently (re-show after 7 days)
  const bannerDismissed = await getJsonMap(KEYS.BANNER_DISMISSED);
  const bannerDismissedAt = bannerDismissed[groupId] || 0;
  const daysSinceBannerDismissed = daysSinceTimestamp(bannerDismissedAt);
  const showBanner = oldestAge >= WARNING_BANNER_DAY && (bannerDismissedAt === 0 || daysSinceBannerDismissed >= 7);

  // Check if soft alert was already shown for this batch
  const alertShown = await getJsonMap(KEYS.SOFT_ALERT_SHOWN);
  const alertShownAt = alertShown[groupId] || 0;
  // Only show alert once per batch — re-enable if new transactions enter the 85-day window
  const showSoftAlert = oldestAge >= SOFT_ALERT_DAY && alertShownAt === 0;

  return {
    groupId,
    oldestTransactionAge: oldestAge,
    expiringCount,
    showBanner,
    showSoftAlert,
    daysUntilLock: Math.max(RETENTION_DAYS - oldestAge, 0),
  };
}

/**
 * Mark the retention banner as dismissed for a group.
 */
export async function dismissRetentionBanner(groupId: string): Promise<void> {
  const map = await getJsonMap(KEYS.BANNER_DISMISSED);
  map[groupId] = Date.now();
  await setJsonMap(KEYS.BANNER_DISMISSED, map);
}

/**
 * Mark the soft alert as shown for a group.
 */
export async function markSoftAlertShown(groupId: string): Promise<void> {
  const map = await getJsonMap(KEYS.SOFT_ALERT_SHOWN);
  map[groupId] = Date.now();
  await setJsonMap(KEYS.SOFT_ALERT_SHOWN, map);
}
