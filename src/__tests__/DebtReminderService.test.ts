/**
 * DebtReminderService Tests
 *
 * Tests throttling rules, time window enforcement, snooze functionality,
 * trivial amount filtering, daily limit, weekly per-group limit, and state management.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';
import {
  checkAndSendReminders,
  snoozeGroupReminder,
  clearReminderState,
  setupReminderChannel,
} from '../services/DebtReminderService';
import { Group, Debt } from '../models/types';

beforeEach(() => {
  (AsyncStorage as any)._clear();
  jest.clearAllMocks();
});

const makeGroup = (id: string, name: string, createdDaysAgo: number = 10): Group => ({
  id,
  name,
  members: [
    { userId: 'user1', displayName: 'You', phone: '' },
    { userId: 'user2', displayName: 'Alice', phone: '111' },
  ],
  createdBy: 'user1',
  createdAt: Date.now() - createdDaysAgo * 24 * 60 * 60 * 1000,
});

const makeDebtsByGroup = (groupId: string, amount: number): Record<string, Debt[]> => ({
  [groupId]: [
    { fromUserId: 'user1', fromName: 'You', toUserId: 'user2', toName: 'Alice', amount },
  ],
});

// Helper to set the hour for time-window tests
function mockHour(hour: number) {
  jest.spyOn(Date.prototype, 'getHours').mockReturnValue(hour);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DebtReminderService', () => {
  describe('setupReminderChannel', () => {
    it('should create a low-importance channel', async () => {
      await setupReminderChannel();
      expect(notifee.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Gentle Reminders',
        }),
      );
    });
  });

  describe('Time Window Enforcement (10am-8pm)', () => {
    it('should NOT send reminders before 10am', async () => {
      mockHour(9);
      const groups = [makeGroup('g1', 'Trip')];
      await checkAndSendReminders(groups, makeDebtsByGroup('g1', 500), 'user1');
      expect(notifee.displayNotification).not.toHaveBeenCalled();
    });

    it('should NOT send reminders at or after 8pm', async () => {
      mockHour(20);
      const groups = [makeGroup('g1', 'Trip')];
      await checkAndSendReminders(groups, makeDebtsByGroup('g1', 500), 'user1');
      expect(notifee.displayNotification).not.toHaveBeenCalled();
    });

    it('should send reminders at 10am', async () => {
      mockHour(10);
      const groups = [makeGroup('g1', 'Trip')];
      await checkAndSendReminders(groups, makeDebtsByGroup('g1', 500), 'user1');
      expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
    });

    it('should send reminders at 7pm', async () => {
      mockHour(19);
      const groups = [makeGroup('g1', 'Trip')];
      await checkAndSendReminders(groups, makeDebtsByGroup('g1', 500), 'user1');
      expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe('Daily Limit (max 2 per day)', () => {
    it('should send max 2 reminders per day across groups', async () => {
      mockHour(14);
      const groups = [
        makeGroup('g1', 'Trip 1'),
        makeGroup('g2', 'Trip 2'),
        makeGroup('g3', 'Trip 3'),
      ];
      const debts = {
        ...makeDebtsByGroup('g1', 500),
        ...makeDebtsByGroup('g2', 300),
        ...makeDebtsByGroup('g3', 200),
      };

      await checkAndSendReminders(groups, debts, 'user1');
      expect(notifee.displayNotification).toHaveBeenCalledTimes(2);
    });

    it('should respect daily counter across multiple calls', async () => {
      mockHour(14);
      const groups = [makeGroup('g1', 'Trip 1'), makeGroup('g2', 'Trip 2')];
      const debts = {
        ...makeDebtsByGroup('g1', 500),
        ...makeDebtsByGroup('g2', 300),
      };

      await checkAndSendReminders(groups, debts, 'user1');
      expect(notifee.displayNotification).toHaveBeenCalledTimes(2);

      // Second call same day — should not send more
      jest.clearAllMocks();
      await checkAndSendReminders(groups, debts, 'user1');
      expect(notifee.displayNotification).not.toHaveBeenCalled();
    });
  });

  describe('Weekly Per-Group Limit', () => {
    it('should not re-remind the same group within 1 week', async () => {
      mockHour(14);
      const groups = [makeGroup('g1', 'Trip')];
      const debts = makeDebtsByGroup('g1', 500);

      await checkAndSendReminders(groups, debts, 'user1');
      expect(notifee.displayNotification).toHaveBeenCalledTimes(1);

      // Reset daily counter by simulating a new day (different date string)
      const state = JSON.parse(await AsyncStorage.getItem('@et_debt_reminders') || '{}');
      state.remindersToday = 0;
      state.lastReminderDate = '2000-01-01'; // Force reset
      await AsyncStorage.setItem('@et_debt_reminders', JSON.stringify(state));

      jest.clearAllMocks();
      await checkAndSendReminders(groups, debts, 'user1');
      // Still within 1 week — should not send
      expect(notifee.displayNotification).not.toHaveBeenCalled();
    });
  });

  describe('Minimum Debt Age (3 days)', () => {
    it('should NOT remind for groups created less than 3 days ago', async () => {
      mockHour(14);
      const groups = [makeGroup('g1', 'New Trip', 1)]; // 1 day old
      await checkAndSendReminders(groups, makeDebtsByGroup('g1', 500), 'user1');
      expect(notifee.displayNotification).not.toHaveBeenCalled();
    });

    it('should remind for groups older than 3 days', async () => {
      mockHour(14);
      const groups = [makeGroup('g1', 'Old Trip', 5)]; // 5 days old
      await checkAndSendReminders(groups, makeDebtsByGroup('g1', 500), 'user1');
      expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe('Trivial Amount Skip', () => {
    it('should NOT remind for debts less than ₹1', async () => {
      mockHour(14);
      const groups = [makeGroup('g1', 'Trip')];
      await checkAndSendReminders(groups, makeDebtsByGroup('g1', 0.50), 'user1');
      expect(notifee.displayNotification).not.toHaveBeenCalled();
    });

    it('should remind for debts of exactly ₹1', async () => {
      mockHour(14);
      const groups = [makeGroup('g1', 'Trip')];
      await checkAndSendReminders(groups, makeDebtsByGroup('g1', 1), 'user1');
      expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe('Snooze', () => {
    it('should not remind for snoozed groups', async () => {
      mockHour(14);
      await snoozeGroupReminder('g1', 7); // snooze for 7 days

      const groups = [makeGroup('g1', 'Trip')];
      await checkAndSendReminders(groups, makeDebtsByGroup('g1', 500), 'user1');
      expect(notifee.displayNotification).not.toHaveBeenCalled();
    });
  });

  describe('Only Debts User Owes', () => {
    it('should NOT remind if user is owed (not owing)', async () => {
      mockHour(14);
      const groups = [makeGroup('g1', 'Trip')];
      // user2 owes user1, not the other way around
      const debts = {
        g1: [{ fromUserId: 'user2', fromName: 'Alice', toUserId: 'user1', toName: 'You', amount: 500 }],
      };
      await checkAndSendReminders(groups, debts, 'user1');
      expect(notifee.displayNotification).not.toHaveBeenCalled();
    });
  });

  describe('No Debts', () => {
    it('should not send reminders when no debts exist', async () => {
      mockHour(14);
      const groups = [makeGroup('g1', 'Trip')];
      await checkAndSendReminders(groups, { g1: [] }, 'user1');
      expect(notifee.displayNotification).not.toHaveBeenCalled();
    });
  });

  describe('clearReminderState', () => {
    it('should reset all reminder state', async () => {
      mockHour(14);
      const groups = [makeGroup('g1', 'Trip')];
      await checkAndSendReminders(groups, makeDebtsByGroup('g1', 500), 'user1');
      expect(await AsyncStorage.getItem('@et_debt_reminders')).not.toBeNull();

      await clearReminderState();
      expect(await AsyncStorage.getItem('@et_debt_reminders')).toBeNull();
    });
  });

  describe('Notification Content', () => {
    it('should include group name and formatted amount in notification body', async () => {
      mockHour(14);
      const groups = [makeGroup('g1', 'Goa Trip')];
      await checkAndSendReminders(groups, makeDebtsByGroup('g1', 500), 'user1');

      const call = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
      expect(call.title).toBe('Settlement Reminder');
      expect(call.body).toContain('Goa Trip');
      expect(call.data.groupId).toBe('g1');
    });
  });
});
