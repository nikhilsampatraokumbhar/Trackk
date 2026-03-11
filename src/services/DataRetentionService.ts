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
  USER_ACCEPTED_DELETION: '@et_retention_accepted',    // JSON: { [groupId]: timestamp }
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RetentionStatus {
  groupId: string;
  oldestTransactionAge: number; // in days
  expiringCount: number;        // transactions that will be purged at 90 days
  showBanner: boolean;          // true if oldest >= 75 days and banner not dismissed
  showSoftAlert: boolean;       // true if oldest >= 85 days and alert not yet shown
  daysUntilPurge: number;       // days until oldest transaction gets purged
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
    daysUntilPurge: Math.max(RETENTION_DAYS - oldestAge, 0),
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

/**
 * User accepted deletion — record this so we don't prompt again for the same batch.
 */
export async function acceptDeletion(groupId: string): Promise<void> {
  const map = await getJsonMap(KEYS.USER_ACCEPTED_DELETION);
  map[groupId] = Date.now();
  await setJsonMap(KEYS.USER_ACCEPTED_DELETION, map);
}

/**
 * Purge group transactions older than 90 days (local storage only).
 * Returns the number of transactions deleted.
 */
export async function purgeExpiredGroupTransactions(groupId: string): Promise<number> {
  const key = `@et_group_txns_${groupId}`;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return 0;

  const txns: GroupTransaction[] = JSON.parse(raw);
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const kept = txns.filter(t => t.timestamp >= cutoff);
  const purgedCount = txns.length - kept.length;

  if (purgedCount > 0) {
    await AsyncStorage.setItem(key, JSON.stringify(kept));

    // Also update cache key
    const cacheKey = `@et_cache_gtxns_${groupId}`;
    const cacheRaw = await AsyncStorage.getItem(cacheKey);
    if (cacheRaw) {
      const cached: GroupTransaction[] = JSON.parse(cacheRaw);
      const cachedKept = cached.filter(t => t.timestamp >= cutoff);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cachedKept));
    }

    // Reset alert tracking since old batch is gone
    const alertMap = await getJsonMap(KEYS.SOFT_ALERT_SHOWN);
    delete alertMap[groupId];
    await setJsonMap(KEYS.SOFT_ALERT_SHOWN, alertMap);

    const acceptedMap = await getJsonMap(KEYS.USER_ACCEPTED_DELETION);
    delete acceptedMap[groupId];
    await setJsonMap(KEYS.USER_ACCEPTED_DELETION, acceptedMap);
  }

  return purgedCount;
}

/**
 * Run on app launch: silently purge expired data for all groups.
 * Only purges groups where user has accepted deletion or never responded to alerts.
 * Premium users are completely skipped (caller should check).
 */
export async function runRetentionCleanup(groupIds: string[]): Promise<{ totalPurged: number; groupsPurged: string[] }> {
  let totalPurged = 0;
  const groupsPurged: string[] = [];

  for (const groupId of groupIds) {
    const purged = await purgeExpiredGroupTransactions(groupId);
    if (purged > 0) {
      totalPurged += purged;
      groupsPurged.push(groupId);
    }
  }

  return { totalPurged, groupsPurged };
}
