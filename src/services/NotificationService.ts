import notifee, {
  AndroidImportance,
  EventType,
  AndroidCategory,
} from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParsedTransaction, ActiveTracker, TrackerType } from '../models/types';
import { formatCurrency } from '../utils/helpers';
import { saveTransaction, addGroupTransaction, getOrCreateUser } from './StorageService';
import { processTransactionForTracking } from './AutoDetectionService';

export const PENDING_GROUP_SPLIT_KEY = '@et_pending_group_split';

const CHANNEL_ID = 'trackk-transactions';

let addToTrackerCallback: ((parsed: ParsedTransaction, tracker: ActiveTracker) => void) | null = null;
let chooseTrackerCallback: ((parsed: ParsedTransaction) => void) | null = null;
let pendingTransaction: ParsedTransaction | null = null;

export async function setupNotificationChannel(): Promise<void> {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Transaction Alerts',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
}

export function registerNotificationCallbacks(
  addCallback: (parsed: ParsedTransaction, tracker: ActiveTracker) => void,
  chooseCallback: (parsed: ParsedTransaction) => void,
): void {
  addToTrackerCallback = addCallback;
  chooseTrackerCallback = chooseCallback;
}

/**
 * Generate a deterministic notification ID from transaction data.
 * If the same transaction triggers multiple times, it updates the
 * existing notification instead of creating duplicates.
 */
function makeNotificationId(parsed: ParsedTransaction): string {
  const roundedTs = Math.floor(parsed.timestamp / 5000) * 5000;
  const merchant = (parsed.merchant || 'unknown').toLowerCase().replace(/\s+/g, '').slice(0, 10);
  return `txn_${parsed.amount}_${merchant}_${roundedTs}`;
}

export async function showTransactionNotification(
  parsed: ParsedTransaction,
  activeTrackers: ActiveTracker[],
): Promise<void> {
  pendingTransaction = parsed;

  const notificationId = makeNotificationId(parsed);
  const title = `💰 ${formatCurrency(parsed.amount)} debited`;
  const body = parsed.merchant
    ? `Payment at ${parsed.merchant}`
    : parsed.bank
    ? `From ${parsed.bank}`
    : 'Bank transaction detected';

  if (activeTrackers.length === 1) {
    const tracker = activeTrackers[0];
    await notifee.displayNotification({
      id: notificationId,
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.MESSAGE,
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: [
          {
            title: `✅ Add to ${tracker.label}`,
            pressAction: { id: 'add_to_tracker', launchActivity: 'default' },
          },
          {
            title: '❌ Ignore',
            pressAction: { id: 'ignore' },
          },
        ],
      },
      data: {
        trackerId: tracker.id,
        trackerType: tracker.type,
        trackerLabel: tracker.label,
        amount: String(parsed.amount),
        merchant: parsed.merchant || '',
        bank: parsed.bank || '',
        rawMessage: parsed.rawMessage,
        timestamp: String(parsed.timestamp),
      },
    });
  } else {
    await notifee.displayNotification({
      id: notificationId,
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.MESSAGE,
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: [
          {
            title: `📋 Choose Tracker (${activeTrackers.length} active)`,
            pressAction: { id: 'choose_tracker', launchActivity: 'default' },
          },
          {
            title: '❌ Ignore',
            pressAction: { id: 'ignore' },
          },
        ],
      },
      data: {
        amount: String(parsed.amount),
        merchant: parsed.merchant || '',
        bank: parsed.bank || '',
        rawMessage: parsed.rawMessage,
        timestamp: String(parsed.timestamp),
      },
    });
  }
}

export async function handleNotificationEvent(
  event: any,
  activeTrackers: ActiveTracker[],
): Promise<void> {
  const { type, detail } = event;

  if (type === EventType.ACTION_PRESS) {
    const actionId = detail.pressAction?.id;

    if (actionId === 'add_to_tracker' && detail.notification?.data) {
      const data = detail.notification.data;
      const amt = Number(data.amount);
      if (!amt || amt <= 0 || !isFinite(amt)) return;
      const tracker: ActiveTracker = {
        type: data.trackerType as any,
        id: data.trackerId,
        label: data.trackerLabel,
      };
      const parsed: ParsedTransaction = {
        amount: amt,
        type: 'debit',
        merchant: data.merchant || undefined,
        bank: data.bank || undefined,
        rawMessage: data.rawMessage,
        timestamp: Number(data.timestamp) || Date.now(),
      };
      if (addToTrackerCallback) addToTrackerCallback(parsed, tracker);
    } else if (actionId === 'choose_tracker' && detail.notification?.data) {
      const data = detail.notification.data;
      const amt = Number(data.amount);
      if (!amt || amt <= 0 || !isFinite(amt)) return;
      const parsed: ParsedTransaction = {
        amount: amt,
        type: 'debit',
        merchant: data.merchant || undefined,
        bank: data.bank || undefined,
        rawMessage: data.rawMessage,
        timestamp: Number(data.timestamp) || Date.now(),
      };
      if (chooseTrackerCallback) chooseTrackerCallback(parsed);
    }

    await notifee.cancelAllNotifications();
  } else if (type === EventType.PRESS && detail.notification?.data) {
    // User tapped the notification body (not an action button)
    const data = detail.notification.data;
    const amt = Number(data.amount);
    if (!amt || amt <= 0 || !isFinite(amt)) return;

    const parsed: ParsedTransaction = {
      amount: amt,
      type: 'debit',
      merchant: data.merchant || undefined,
      bank: data.bank || undefined,
      rawMessage: data.rawMessage,
      timestamp: Number(data.timestamp) || Date.now(),
    };

    // If notification has a specific tracker (single tracker case), route to it
    if (data.trackerType && data.trackerId) {
      const tracker: ActiveTracker = {
        type: data.trackerType as any,
        id: data.trackerId,
        label: data.trackerLabel,
      };
      if (addToTrackerCallback) addToTrackerCallback(parsed, tracker);
    } else {
      // Multiple trackers — show selection dialog
      if (chooseTrackerCallback) chooseTrackerCallback(parsed);
    }

    await notifee.cancelAllNotifications();
  }
}

export function registerBackgroundHandler(): void {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    const isActionPress = type === EventType.ACTION_PRESS;
    const isBodyPress = type === EventType.PRESS;

    if ((isActionPress || isBodyPress) && detail.notification?.data) {
      const actionId = detail.pressAction?.id;
      const data = detail.notification.data as Record<string, string>;

      // For action button "add_to_tracker" or notification body tap with tracker data
      const shouldAddToTracker =
        (isActionPress && actionId === 'add_to_tracker') ||
        (isBodyPress && data.trackerType && data.trackerId);

      if (shouldAddToTracker) {
        const parsedAmount = Number(data.amount);
        if (!parsedAmount || parsedAmount <= 0 || !isFinite(parsedAmount)) return;

        const parsed: ParsedTransaction = {
          amount: parsedAmount,
          type: 'debit',
          merchant: data.merchant || undefined,
          bank: data.bank || undefined,
          rawMessage: data.rawMessage,
          timestamp: Number(data.timestamp) || Date.now(),
        };
        const trackerType = data.trackerType as TrackerType;
        const trackerId = data.trackerId;

        // Auto-detect subscriptions/EMIs/investments
        try { await processTransactionForTracking(parsed); } catch {}

        if (trackerType === 'group') {
          // Don't auto-save group expenses — stash data so the app opens
          // SplitEditor for the user to review and confirm the split
          await AsyncStorage.setItem(PENDING_GROUP_SPLIT_KEY, JSON.stringify({
            transaction: parsed,
            trackerId,
            trackerLabel: data.trackerLabel || 'Group',
          }));
        } else {
          const user = await getOrCreateUser();
          await saveTransaction(parsed, trackerType, user.id);
        }
      }

      await notifee.cancelAllNotifications();
    }
  });
}

/**
 * Show a confirmation notification when a transaction is auto-saved
 * to both reimbursement and personal trackers.
 */
export async function showAutoSavedNotification(
  parsed: ParsedTransaction,
): Promise<void> {
  const notificationId = makeNotificationId(parsed);
  const title = `💰 ${formatCurrency(parsed.amount)} tracked`;
  const body = parsed.merchant
    ? `${parsed.merchant} → Saved to Reimbursement + Personal`
    : 'Saved to Reimbursement + Personal';

  await notifee.displayNotification({
    id: notificationId,
    title,
    body,
    android: {
      channelId: CHANNEL_ID,
      category: AndroidCategory.MESSAGE,
      importance: AndroidImportance.HIGH,
    },
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= 1;
}

export function getPendingTransaction(): ParsedTransaction | null {
  return pendingTransaction;
}

export function clearPendingTransaction(): void {
  pendingTransaction = null;
}
