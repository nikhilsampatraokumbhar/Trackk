import notifee, {
  AndroidImportance,
  EventType,
  AndroidCategory,
} from '@notifee/react-native';
import { ParsedTransaction, ActiveTracker, TrackerType } from '../models/types';
import { formatCurrency } from '../utils/helpers';
import { saveTransaction, addGroupTransaction, getOrCreateUser } from './StorageService';

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

export async function showTransactionNotification(
  parsed: ParsedTransaction,
  activeTrackers: ActiveTracker[],
): Promise<void> {
  pendingTransaction = parsed;

  const title = `💰 ${formatCurrency(parsed.amount)} debited`;
  const body = parsed.merchant
    ? `Payment at ${parsed.merchant}`
    : parsed.bank
    ? `From ${parsed.bank}`
    : 'Bank transaction detected';

  if (activeTrackers.length === 1) {
    const tracker = activeTrackers[0];
    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.MESSAGE,
        importance: AndroidImportance.HIGH,
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
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.MESSAGE,
        importance: AndroidImportance.HIGH,
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
      const tracker: ActiveTracker = {
        type: data.trackerType as any,
        id: data.trackerId,
        label: data.trackerLabel,
      };
      const parsed: ParsedTransaction = {
        amount: Number(data.amount),
        type: 'debit',
        merchant: data.merchant || undefined,
        bank: data.bank || undefined,
        rawMessage: data.rawMessage,
        timestamp: Number(data.timestamp),
      };
      if (addToTrackerCallback) addToTrackerCallback(parsed, tracker);
    } else if (actionId === 'choose_tracker' && detail.notification?.data) {
      const data = detail.notification.data;
      const parsed: ParsedTransaction = {
        amount: Number(data.amount),
        type: 'debit',
        merchant: data.merchant || undefined,
        bank: data.bank || undefined,
        rawMessage: data.rawMessage,
        timestamp: Number(data.timestamp),
      };
      if (chooseTrackerCallback) chooseTrackerCallback(parsed);
    }

    await notifee.cancelAllNotifications();
  }
}

export function registerBackgroundHandler(): void {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      const actionId = detail.pressAction?.id;

      if (actionId === 'add_to_tracker' && detail.notification?.data) {
        const data = detail.notification.data as Record<string, string>;
        const parsed: ParsedTransaction = {
          amount: Number(data.amount),
          type: 'debit',
          merchant: data.merchant || undefined,
          bank: data.bank || undefined,
          rawMessage: data.rawMessage,
          timestamp: Number(data.timestamp),
        };
        const trackerType = data.trackerType as TrackerType;
        const trackerId = data.trackerId;
        const user = await getOrCreateUser();
        if (trackerType === 'group') {
          await addGroupTransaction(parsed, trackerId, user.id);
        } else {
          await saveTransaction(parsed, trackerType, user.id);
        }
      }

      await notifee.cancelAllNotifications();
    }
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
