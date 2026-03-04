import notifee, {
  AndroidImportance,
  AndroidCategory,
  EventType,
  Event,
} from '@notifee/react-native';
import { ParsedTransaction, ActiveTracker, TrackerType } from '../models/types';
import { buildDescription } from './TransactionParser';

/**
 * Notification Service
 *
 * Creates actionable notifications (like WhatsApp quick-reply) when a
 * transaction is detected. User can tap "Add" or "Ignore" directly
 * from the notification — no need to open the app.
 *
 * Flow:
 * - 1 active tracker  → notification with "Add to [name]" + "Ignore" buttons
 * - 2+ active trackers → notification with "Choose Tracker" + "Ignore" buttons
 *   (tapping "Choose" opens the app to a tracker selection dialog)
 */

const CHANNEL_ID = 'expense-tracker-transactions';

// Callbacks for handling user actions from notifications
type AddCallback = (parsed: ParsedTransaction, trackerType: TrackerType, trackerId: string) => void;
type ChooseCallback = (parsed: ParsedTransaction) => void;

let onAddToTracker: AddCallback | null = null;
let onChooseTracker: ChooseCallback | null = null;

/**
 * Initialize notification channels (must be called on app start).
 */
export async function setupNotificationChannel(): Promise<void> {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Transaction Alerts',
    description: 'Notifications when bank transactions are detected',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
}

/**
 * Register callbacks for notification actions.
 */
export function registerNotificationCallbacks(
  addCallback: AddCallback,
  chooseCallback: ChooseCallback,
): void {
  onAddToTracker = addCallback;
  onChooseTracker = chooseCallback;
}

/**
 * Show a transaction notification with action buttons.
 */
export async function showTransactionNotification(
  parsed: ParsedTransaction,
  activeTrackers: ActiveTracker[],
): Promise<void> {
  if (activeTrackers.length === 0) return;

  const amountStr = `₹${parsed.amount.toLocaleString('en-IN')}`;
  const description = buildDescription(parsed);

  if (activeTrackers.length === 1) {
    // Single tracker active: show direct "Add" button
    const tracker = activeTrackers[0];

    await notifee.displayNotification({
      id: `txn-${parsed.timestamp}`,
      title: `💰 ${amountStr} debited`,
      body: `${description}\nAdd to ${tracker.label}?`,
      data: {
        parsedJson: JSON.stringify(parsed),
        trackerType: tracker.type,
        trackerId: tracker.id,
      },
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.SOCIAL,
        pressAction: { id: 'default' },
        actions: [
          {
            title: `✅ Add to ${tracker.label}`,
            pressAction: { id: 'add-to-tracker' },
          },
          {
            title: '❌ Ignore',
            pressAction: { id: 'ignore' },
          },
        ],
        smallIcon: 'ic_notification',
        importance: AndroidImportance.HIGH,
        autoCancel: true,
      },
    });
  } else {
    // Multiple trackers active: let user choose
    const trackerNames = activeTrackers.map(t => t.label).join(', ');

    await notifee.displayNotification({
      id: `txn-${parsed.timestamp}`,
      title: `💰 ${amountStr} debited`,
      body: `${description}\nActive trackers: ${trackerNames}`,
      data: {
        parsedJson: JSON.stringify(parsed),
        trackerCount: String(activeTrackers.length),
      },
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.SOCIAL,
        pressAction: { id: 'default' },
        actions: [
          {
            title: `📋 Choose Tracker (${activeTrackers.length} active)`,
            pressAction: {
              id: 'choose-tracker',
              launchActivity: 'default', // opens the app
            },
          },
          {
            title: '❌ Ignore',
            pressAction: { id: 'ignore' },
          },
        ],
        smallIcon: 'ic_notification',
        importance: AndroidImportance.HIGH,
        autoCancel: true,
      },
    });
  }
}

/**
 * Handle notification events (called from foreground and background).
 * Must be registered in App.tsx.
 */
export async function handleNotificationEvent(event: Event): Promise<void> {
  const { type, detail } = event;

  if (type === EventType.ACTION_PRESS) {
    const actionId = detail.pressAction?.id;
    const data = detail.notification?.data;

    if (!data?.parsedJson) return;

    const parsed: ParsedTransaction = JSON.parse(data.parsedJson as string);

    switch (actionId) {
      case 'add-to-tracker': {
        const trackerType = data.trackerType as TrackerType;
        const trackerId = data.trackerId as string;
        onAddToTracker?.(parsed, trackerType, trackerId);
        break;
      }
      case 'choose-tracker': {
        // This opens the app — the app will show a dialog
        onChooseTracker?.(parsed);
        break;
      }
      case 'ignore':
        // Do nothing, just dismiss
        break;
    }
  }

  // Also handle the case where user taps the notification body (not an action)
  if (type === EventType.PRESS) {
    const data = detail.notification?.data;
    if (data?.parsedJson) {
      const parsed: ParsedTransaction = JSON.parse(data.parsedJson as string);
      const trackerCount = parseInt(data.trackerCount as string || '0', 10);

      if (trackerCount > 1) {
        onChooseTracker?.(parsed);
      } else if (data.trackerType) {
        onAddToTracker?.(
          parsed,
          data.trackerType as TrackerType,
          data.trackerId as string,
        );
      }
    }
  }
}

/**
 * Show a reminder notification to turn off group tracking for a trip.
 * Called when a group tracker has been active for 14+ days.
 */
export async function showTripTrackerReminderNotification(
  groupId: string,
  groupName: string,
  daysActive: number,
): Promise<void> {
  await notifee.displayNotification({
    id: `trip-reminder-${groupId}`,
    title: `Still tracking "${groupName}"?`,
    body: `Your group tracker has been on for ${daysActive} days. Most trips wrap up in 2–3 weeks — tap to turn it off if the trip is over.`,
    data: { groupId, type: 'trip-reminder' },
    android: {
      channelId: CHANNEL_ID,
      smallIcon: 'ic_notification',
      importance: AndroidImportance.DEFAULT,
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        {
          title: 'Turn Off Tracker',
          pressAction: { id: 'turn-off-trip-tracker', launchActivity: 'default' },
        },
        {
          title: 'Keep On',
          pressAction: { id: 'keep-trip-tracker' },
        },
      ],
      autoCancel: true,
    },
  });
}

/**
 * Request notification permissions (Android 13+).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= 1; // AUTHORIZED or PROVISIONAL
}

/**
 * Handle background notification events.
 * This must be called at the top level (outside any component).
 */
export function registerBackgroundHandler(): void {
  notifee.onBackgroundEvent(handleNotificationEvent);
}
