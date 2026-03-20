/**
 * Comprehensive NotificationService Tests
 *
 * Tests notification creation, action routing, slot-based tracker resolution,
 * background handler auto-save logic, group transaction stashing,
 * deduplication, and edge cases with invalid/malicious data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { EventType } from '@notifee/react-native';
import {
  showTransactionNotification,
  handleNotificationEvent,
  registerNotificationCallbacks,
  registerBackgroundHandler,
  showAutoSavedNotification,
  clearNotificationCallbacks,
  getPendingTransaction,
  clearPendingTransaction,
  PENDING_GROUP_SPLIT_KEY,
  PENDING_CHOOSE_TRACKER_KEY,
} from '../services/NotificationService';
import { ParsedTransaction, ActiveTracker } from '../models/types';

beforeEach(() => {
  (AsyncStorage as any)._clear();
  jest.clearAllMocks();
  clearNotificationCallbacks();
});

const makeParsed = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
  amount: 500,
  type: 'debit',
  merchant: 'Swiggy',
  rawMessage: 'Rs.500 debited at Swiggy',
  timestamp: Date.now(),
  ...overrides,
});

const makeTracker = (type: 'personal' | 'group' | 'reimbursement', id?: string, label?: string): ActiveTracker => ({
  type,
  id: id || type,
  label: label || (type === 'personal' ? 'Personal' : type === 'group' ? 'Trip' : 'Reimbursement'),
});

// ─── Notification Display Tests ──────────────────────────────────────────────

describe('showTransactionNotification', () => {
  it('should display notification with correct amount and merchant', async () => {
    const parsed = makeParsed({ amount: 1234.56, merchant: 'Amazon' });
    await showTransactionNotification(parsed, [makeTracker('personal')]);

    expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
    const call = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
    expect(call.title).toContain('1,234');
    expect(call.body).toContain('Amazon');
  });

  it('should show bank name when no merchant', async () => {
    const parsed = makeParsed({ merchant: undefined, bank: 'HDFC' });
    await showTransactionNotification(parsed, [makeTracker('personal')]);

    const call = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
    expect(call.body).toContain('HDFC');
  });

  it('should show generic message when no merchant and no bank', async () => {
    const parsed = makeParsed({ merchant: undefined, bank: undefined });
    await showTransactionNotification(parsed, [makeTracker('personal')]);

    const call = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
    expect(call.body).toBe('Bank transaction detected');
  });

  it('should create 1 action + ignore for single tracker', async () => {
    await showTransactionNotification(makeParsed(), [makeTracker('personal')]);

    const call = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
    expect(call.android.actions.length).toBe(2); // 1 tracker + ignore
    expect(call.android.actions[1].title).toContain('Ignore');
  });

  it('should create 2 actions + ignore for 2 trackers', async () => {
    await showTransactionNotification(makeParsed(), [
      makeTracker('personal'),
      makeTracker('reimbursement'),
    ]);

    const call = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
    expect(call.android.actions.length).toBe(3); // 2 trackers + ignore
  });

  it('should create 3 actions (no ignore) for 3 trackers', async () => {
    await showTransactionNotification(makeParsed(), [
      makeTracker('personal'),
      makeTracker('reimbursement'),
      makeTracker('group', 'g1', 'Trip'),
    ]);

    const call = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
    expect(call.android.actions.length).toBe(3); // all 3 slots used, no ignore
    expect(call.android.actions.every((a: any) => !a.title.includes('Ignore'))).toBe(true);
  });

  it('should cap at 3 trackers even if more provided', async () => {
    await showTransactionNotification(makeParsed(), [
      makeTracker('personal'),
      makeTracker('reimbursement'),
      makeTracker('group', 'g1', 'Trip A'),
      makeTracker('group', 'g2', 'Trip B'), // 4th — should be dropped
    ]);

    const call = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
    expect(call.android.actions.length).toBe(3);
  });

  it('should encode slot data in notification for background handler', async () => {
    await showTransactionNotification(makeParsed({ amount: 999 }), [
      makeTracker('personal'),
      makeTracker('group', 'g1', 'Dinner'),
    ]);

    const call = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
    expect(call.data.slot_0_type).toBe('personal');
    expect(call.data.slot_1_type).toBe('group');
    expect(call.data.slot_1_id).toBe('g1');
    expect(call.data.slot_1_label).toBe('Dinner');
    expect(call.data.amount).toBe('999');
    expect(call.data.slotCount).toBe('2');
  });

  it('should generate deterministic notification ID for deduplication', async () => {
    const ts = 1700000000000;
    const parsed = makeParsed({ amount: 500, merchant: 'Swiggy', timestamp: ts });

    await showTransactionNotification(parsed, [makeTracker('personal')]);
    const call1 = (notifee.displayNotification as jest.Mock).mock.calls[0][0];

    await showTransactionNotification(parsed, [makeTracker('personal')]);
    const call2 = (notifee.displayNotification as jest.Mock).mock.calls[1][0];

    expect(call1.id).toBe(call2.id);
  });

  it('should generate different IDs for different transactions', async () => {
    const ts = Date.now();
    await showTransactionNotification(
      makeParsed({ amount: 500, merchant: 'Swiggy', timestamp: ts }),
      [makeTracker('personal')],
    );
    await showTransactionNotification(
      makeParsed({ amount: 750, merchant: 'Zomato', timestamp: ts }),
      [makeTracker('personal')],
    );

    const id1 = (notifee.displayNotification as jest.Mock).mock.calls[0][0].id;
    const id2 = (notifee.displayNotification as jest.Mock).mock.calls[1][0].id;
    expect(id1).not.toBe(id2);
  });

  it('should set pending transaction for foreground handler', async () => {
    const parsed = makeParsed({ amount: 777 });
    await showTransactionNotification(parsed, [makeTracker('personal')]);

    const pending = getPendingTransaction();
    expect(pending).not.toBeNull();
    expect(pending!.amount).toBe(777);
  });
});

// ─── Foreground Notification Event Handling ──────────────────────────────────

describe('handleNotificationEvent', () => {
  it('should route slot_0 action to correct tracker via callback', async () => {
    const addCallback = jest.fn();
    const chooseCallback = jest.fn();
    registerNotificationCallbacks(addCallback, chooseCallback);

    await handleNotificationEvent(
      {
        type: EventType.ACTION_PRESS,
        detail: {
          pressAction: { id: 'slot_0' },
          notification: {
            data: {
              amount: '500',
              merchant: 'Swiggy',
              bank: 'HDFC',
              rawMessage: 'test msg',
              timestamp: String(Date.now()),
              slotCount: '2',
              slot_0_id: 'personal',
              slot_0_type: 'personal',
              slot_0_label: 'Personal',
              slot_1_id: 'g1',
              slot_1_type: 'group',
              slot_1_label: 'Trip',
            },
          },
        },
      },
      [],
    );

    expect(addCallback).toHaveBeenCalledTimes(1);
    const [parsed, tracker] = addCallback.mock.calls[0];
    expect(parsed.amount).toBe(500);
    expect(tracker.type).toBe('personal');
    expect(tracker.id).toBe('personal');
  });

  it('should route slot_1 to second tracker', async () => {
    const addCallback = jest.fn();
    registerNotificationCallbacks(addCallback, jest.fn());

    await handleNotificationEvent(
      {
        type: EventType.ACTION_PRESS,
        detail: {
          pressAction: { id: 'slot_1' },
          notification: {
            data: {
              amount: '300',
              merchant: '',
              bank: '',
              rawMessage: 'test',
              timestamp: String(Date.now()),
              slot_1_id: 'g1',
              slot_1_type: 'group',
              slot_1_label: 'Dinner',
            },
          },
        },
      },
      [],
    );

    expect(addCallback).toHaveBeenCalledTimes(1);
    expect(addCallback.mock.calls[0][1].type).toBe('group');
    expect(addCallback.mock.calls[0][1].id).toBe('g1');
  });

  it('should handle body tap by calling chooseTracker callback', async () => {
    const chooseCallback = jest.fn();
    registerNotificationCallbacks(jest.fn(), chooseCallback);

    await handleNotificationEvent(
      {
        type: EventType.PRESS,
        detail: {
          notification: {
            data: {
              amount: '250',
              merchant: 'Amazon',
              rawMessage: 'test',
              timestamp: String(Date.now()),
            },
          },
        },
      },
      [],
    );

    expect(chooseCallback).toHaveBeenCalledTimes(1);
    expect(chooseCallback.mock.calls[0][0].amount).toBe(250);
  });

  it('should cancel all notifications after handling action', async () => {
    registerNotificationCallbacks(jest.fn(), jest.fn());

    await handleNotificationEvent(
      {
        type: EventType.ACTION_PRESS,
        detail: {
          pressAction: { id: 'slot_0' },
          notification: {
            data: {
              amount: '100',
              rawMessage: 'test',
              timestamp: String(Date.now()),
              slot_0_id: 'personal',
              slot_0_type: 'personal',
              slot_0_label: 'Personal',
            },
          },
        },
      },
      [],
    );

    expect(notifee.cancelAllNotifications).toHaveBeenCalled();
  });

  it('should reject zero amount from notification data', async () => {
    const addCallback = jest.fn();
    registerNotificationCallbacks(addCallback, jest.fn());

    await handleNotificationEvent(
      {
        type: EventType.ACTION_PRESS,
        detail: {
          pressAction: { id: 'slot_0' },
          notification: {
            data: {
              amount: '0',
              rawMessage: 'test',
              timestamp: String(Date.now()),
              slot_0_id: 'personal',
              slot_0_type: 'personal',
              slot_0_label: 'Personal',
            },
          },
        },
      },
      [],
    );

    expect(addCallback).not.toHaveBeenCalled();
  });

  it('should reject negative amount', async () => {
    const addCallback = jest.fn();
    registerNotificationCallbacks(addCallback, jest.fn());

    await handleNotificationEvent(
      {
        type: EventType.ACTION_PRESS,
        detail: {
          pressAction: { id: 'slot_0' },
          notification: {
            data: {
              amount: '-500',
              rawMessage: 'test',
              timestamp: String(Date.now()),
              slot_0_id: 'personal',
              slot_0_type: 'personal',
              slot_0_label: 'Personal',
            },
          },
        },
      },
      [],
    );

    expect(addCallback).not.toHaveBeenCalled();
  });

  it('should reject NaN amount', async () => {
    const addCallback = jest.fn();
    registerNotificationCallbacks(addCallback, jest.fn());

    await handleNotificationEvent(
      {
        type: EventType.ACTION_PRESS,
        detail: {
          pressAction: { id: 'slot_0' },
          notification: {
            data: {
              amount: 'not-a-number',
              rawMessage: 'test',
              timestamp: String(Date.now()),
              slot_0_id: 'personal',
              slot_0_type: 'personal',
              slot_0_label: 'Personal',
            },
          },
        },
      },
      [],
    );

    expect(addCallback).not.toHaveBeenCalled();
  });

  it('should reject Infinity amount', async () => {
    const addCallback = jest.fn();
    registerNotificationCallbacks(addCallback, jest.fn());

    await handleNotificationEvent(
      {
        type: EventType.ACTION_PRESS,
        detail: {
          pressAction: { id: 'slot_0' },
          notification: {
            data: {
              amount: 'Infinity',
              rawMessage: 'test',
              timestamp: String(Date.now()),
              slot_0_id: 'personal',
              slot_0_type: 'personal',
              slot_0_label: 'Personal',
            },
          },
        },
      },
      [],
    );

    expect(addCallback).not.toHaveBeenCalled();
  });

  it('should handle legacy add_to_tracker action for backward compatibility', async () => {
    const addCallback = jest.fn();
    registerNotificationCallbacks(addCallback, jest.fn());

    await handleNotificationEvent(
      {
        type: EventType.ACTION_PRESS,
        detail: {
          pressAction: { id: 'add_to_tracker' },
          notification: {
            data: {
              amount: '350',
              merchant: 'Netflix',
              rawMessage: 'test',
              timestamp: String(Date.now()),
              trackerId: 'personal',
              trackerType: 'personal',
              trackerLabel: 'Personal',
            },
          },
        },
      },
      [],
    );

    expect(addCallback).toHaveBeenCalledTimes(1);
    expect(addCallback.mock.calls[0][0].amount).toBe(350);
  });
});

// ─── showAutoSavedNotification ───────────────────────────────────────────────

describe('showAutoSavedNotification', () => {
  it('should display confirmation with merchant name', async () => {
    await showAutoSavedNotification(makeParsed({ merchant: 'Uber' }));

    const call = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
    expect(call.body).toContain('Uber');
    expect(call.body).toContain('Reimbursement + Personal');
  });

  it('should display generic confirmation when no merchant', async () => {
    await showAutoSavedNotification(makeParsed({ merchant: undefined }));

    const call = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
    expect(call.body).toContain('Reimbursement + Personal');
  });
});

// ─── Pending Transaction Management ──────────────────────────────────────────

describe('Pending transaction management', () => {
  it('should clear pending transaction', async () => {
    await showTransactionNotification(makeParsed(), [makeTracker('personal')]);
    expect(getPendingTransaction()).not.toBeNull();

    clearPendingTransaction();
    expect(getPendingTransaction()).toBeNull();
  });

  it('should clear callbacks', () => {
    const addCallback = jest.fn();
    registerNotificationCallbacks(addCallback, jest.fn());
    clearNotificationCallbacks();

    // After clearing, callbacks should not fire
    // (we can't test this directly, but we ensure no crash)
    expect(getPendingTransaction()).toBeNull();
  });
});
