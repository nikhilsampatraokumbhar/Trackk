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
export const PENDING_CHOOSE_TRACKER_KEY = '@et_pending_choose_tracker';

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

/**
 * Show transaction notification with up to 3 action buttons — one per active tracker slot.
 * Android supports max 3 action buttons, which maps perfectly to our 3-slot design.
 *
 * - 1 tracker  → [Add to Tracker] [Ignore]
 * - 2 trackers → [Tracker 1] [Tracker 2] [Ignore]
 * - 3 trackers → [Tracker 1] [Tracker 2] [Tracker 3]  (no ignore — all 3 slots used)
 */
export async function showTransactionNotification(
  parsed: ParsedTransaction,
  activeTrackers: ActiveTracker[],
  _defaultTracker?: ActiveTracker, // kept for backward compat, no longer used
): Promise<void> {
  pendingTransaction = parsed;

  const notificationId = makeNotificationId(parsed);
  const title = `💰 ${formatCurrency(parsed.amount)} debited`;
  const body = parsed.merchant
    ? `Payment at ${parsed.merchant}`
    : parsed.bank
    ? `From ${parsed.bank}`
    : 'Bank transaction detected';

  // Build one action button per active tracker (max 3)
  const trackerSlots = activeTrackers.slice(0, 3);
  const actions: any[] = trackerSlots.map((tracker, index) => {
    const emoji = tracker.type === 'personal' ? '💳'
      : tracker.type === 'reimbursement' ? '🧾' : '👥';
    return {
      title: `${emoji} ${tracker.label}`,
      pressAction: { id: `slot_${index}`, launchActivity: 'default' },
    };
  });

  // If fewer than 3 trackers, add an Ignore button
  if (trackerSlots.length < 3) {
    actions.push({
      title: '❌ Ignore',
      pressAction: { id: 'ignore' },
    });
  }

  // Encode all slot trackers into notification data so background handler can resolve them
  const data: Record<string, string> = {
    amount: String(parsed.amount),
    merchant: parsed.merchant || '',
    bank: parsed.bank || '',
    rawMessage: parsed.rawMessage,
    timestamp: String(parsed.timestamp),
    slotCount: String(trackerSlots.length),
  };

  trackerSlots.forEach((tracker, index) => {
    data[`slot_${index}_id`] = tracker.id;
    data[`slot_${index}_type`] = tracker.type;
    data[`slot_${index}_label`] = tracker.label;
  });

  // Legacy fields for backward compat (cold-start routing uses these)
  if (trackerSlots.length > 0) {
    data.trackerId = trackerSlots[0].id;
    data.trackerType = trackerSlots[0].type;
    data.trackerLabel = trackerSlots[0].label;
  }

  await notifee.displayNotification({
    id: notificationId,
    title,
    body,
    android: {
      channelId: CHANNEL_ID,
      category: AndroidCategory.MESSAGE,
      importance: AndroidImportance.HIGH,
      pressAction: { id: 'default', launchActivity: 'default' },
      actions,
    },
    data,
  });
}

/**
 * Resolve a slot action ID (slot_0, slot_1, slot_2) to the tracker from notification data.
 */
function resolveSlotTracker(actionId: string, data: Record<string, any>): ActiveTracker | null {
  const match = actionId.match(/^slot_(\d)$/);
  if (!match) return null;
  const index = match[1];
  const id = data[`slot_${index}_id`];
  const trackerType = data[`slot_${index}_type`];
  const label = data[`slot_${index}_label`];
  if (!id || !trackerType) return null;
  return { type: trackerType as TrackerType, id, label: label || '' };
}

export async function handleNotificationEvent(
  event: any,
  activeTrackers: ActiveTracker[],
): Promise<void> {
  const { type, detail } = event;

  if (type === EventType.ACTION_PRESS) {
    const actionId = detail.pressAction?.id;

    // Handle slot-based action buttons (slot_0, slot_1, slot_2)
    if (actionId?.startsWith('slot_') && detail.notification?.data) {
      const data = detail.notification.data;
      const amt = Number(data.amount);
      if (!amt || amt <= 0 || !isFinite(amt)) return;
      const tracker = resolveSlotTracker(actionId, data);
      if (!tracker) return;
      const parsed: ParsedTransaction = {
        amount: amt,
        type: 'debit',
        merchant: data.merchant || undefined,
        bank: data.bank || undefined,
        rawMessage: data.rawMessage,
        timestamp: Number(data.timestamp) || Date.now(),
      };
      if (addToTrackerCallback) addToTrackerCallback(parsed, tracker);
    }
    // Legacy: handle old add_to_tracker action (backward compat)
    else if (actionId === 'add_to_tracker' && detail.notification?.data) {
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
    // Show selection dialog so the user can choose where to route
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

      const parsedAmount = Number(data.amount);
      if (!parsedAmount || parsedAmount <= 0 || !isFinite(parsedAmount)) {
        await notifee.cancelAllNotifications();
        return;
      }

      const parsed: ParsedTransaction = {
        amount: parsedAmount,
        type: 'debit',
        merchant: data.merchant || undefined,
        bank: data.bank || undefined,
        rawMessage: data.rawMessage,
        timestamp: Number(data.timestamp) || Date.now(),
      };

      // Body tap → stash for selection dialog
      if (isBodyPress) {
        await AsyncStorage.setItem(PENDING_CHOOSE_TRACKER_KEY, JSON.stringify({
          transaction: parsed,
        }));
        await notifee.cancelAllNotifications();
        return;
      }

      // Slot-based action buttons (slot_0, slot_1, slot_2)
      const slotTracker = actionId ? resolveSlotTracker(actionId, data) : null;
      // Also support legacy add_to_tracker action
      const legacyTracker = actionId === 'add_to_tracker' && data.trackerType && data.trackerId
        ? { type: data.trackerType as TrackerType, id: data.trackerId, label: data.trackerLabel || '' }
        : null;
      const tracker = slotTracker || legacyTracker;

      if (tracker) {
        // Auto-detect subscriptions/EMIs/investments
        try { await processTransactionForTracking(parsed); } catch {}

        if (tracker.type === 'group') {
          // Don't auto-save group expenses — stash data so the app opens
          // SplitEditor for the user to review and confirm the split
          await AsyncStorage.setItem(PENDING_GROUP_SPLIT_KEY, JSON.stringify({
            transaction: parsed,
            trackerId: tracker.id,
            trackerLabel: tracker.label || 'Group',
          }));
        } else {
          const user = await getOrCreateUser();
          await saveTransaction(parsed, tracker.type, user.id);
        }
      }

      // Ignore action or unrecognized — just dismiss
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

export function clearNotificationCallbacks(): void {
  addToTrackerCallback = null;
  chooseTrackerCallback = null;
  pendingTransaction = null;
}

export function getPendingTransaction(): ParsedTransaction | null {
  return pendingTransaction;
}

export function clearPendingTransaction(): void {
  pendingTransaction = null;
}
