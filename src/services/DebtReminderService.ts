/**
 * Subtle Debt Reminder Service
 *
 * Sends gentle, non-irritating reminders for outstanding group debts.
 * Rules:
 *  - Only reminds for debts that are at least 3 days old
 *  - Maximum 1 reminder per group per week
 *  - Maximum 2 total reminders per day across all groups
 *  - Reminders are sent at a comfortable time (10am-8pm only)
 *  - Users can snooze reminders for a group
 *  - Phrasing is friendly and non-aggressive
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { Group, Debt } from '../models/types';
import { formatCurrency } from '../utils/helpers';

const REMINDER_STATE_KEY = '@et_debt_reminders';
const CHANNEL_ID = 'trackk-gentle-reminders';

interface ReminderState {
  lastReminderByGroup: Record<string, number>; // groupId → timestamp of last reminder
  remindersToday: number;
  lastReminderDate: string; // YYYY-MM-DD
  snoozedGroups: Record<string, number>; // groupId → snooze until timestamp
}

const FRIENDLY_MESSAGES = [
  (name: string, amount: string) => `Hey, just a gentle nudge — you have ${amount} pending with ${name}`,
  (name: string, amount: string) => `Quick reminder: ${amount} outstanding in ${name}. No rush!`,
  (name: string, amount: string) => `FYI — ${name} has ${amount} unsettled. Settle when convenient`,
  (name: string, amount: string) => `Friendly reminder: ${amount} pending in ${name}`,
];

async function getState(): Promise<ReminderState> {
  const raw = await AsyncStorage.getItem(REMINDER_STATE_KEY);
  if (raw) {
    const state: ReminderState = JSON.parse(raw);
    // Reset daily counter if it's a new day
    const today = new Date().toISOString().slice(0, 10);
    if (state.lastReminderDate !== today) {
      state.remindersToday = 0;
      state.lastReminderDate = today;
    }
    return state;
  }
  return {
    lastReminderByGroup: {},
    remindersToday: 0,
    lastReminderDate: new Date().toISOString().slice(0, 10),
    snoozedGroups: {},
  };
}

async function saveState(state: ReminderState): Promise<void> {
  await AsyncStorage.setItem(REMINDER_STATE_KEY, JSON.stringify(state));
}

export async function setupReminderChannel(): Promise<void> {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Gentle Reminders',
    importance: AndroidImportance.LOW, // No sound, just visual
    sound: '',
  });
}

/**
 * Check if we should send a reminder for a group and send it if appropriate.
 * Called from app foreground check (e.g. on app open or periodic check).
 */
export async function checkAndSendReminders(
  groups: Group[],
  debtsByGroup: Record<string, Debt[]>,
  userId: string,
): Promise<void> {
  const now = Date.now();
  const hour = new Date().getHours();

  // Only send between 10am and 8pm
  if (hour < 10 || hour >= 20) return;

  const state = await getState();

  // Max 2 reminders per day
  if (state.remindersToday >= 2) return;

  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

  for (const group of groups) {
    if (state.remindersToday >= 2) break;

    const debts = debtsByGroup[group.id] || [];
    // Only debts where current user owes someone
    const userDebts = debts.filter(d => d.fromUserId === userId);
    if (userDebts.length === 0) continue;

    const totalOwed = userDebts.reduce((s, d) => s + d.amount, 0);
    if (totalOwed < 1) continue; // Skip trivial amounts

    // Check snooze
    const snoozedUntil = state.snoozedGroups[group.id] || 0;
    if (now < snoozedUntil) continue;

    // Check last reminder for this group (max 1 per week)
    const lastReminder = state.lastReminderByGroup[group.id] || 0;
    if (now - lastReminder < ONE_WEEK) continue;

    // Only remind for debts older than 3 days
    if (now - (group.createdAt || now) < THREE_DAYS) continue;

    // Send the reminder
    const msgFn = FRIENDLY_MESSAGES[Math.floor(Math.random() * FRIENDLY_MESSAGES.length)];
    const body = msgFn(group.name, formatCurrency(totalOwed));

    await notifee.displayNotification({
      id: `debt_reminder_${group.id}`,
      title: 'Settlement Reminder',
      body,
      android: {
        channelId: CHANNEL_ID,
        importance: AndroidImportance.LOW,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
      data: {
        type: 'debt_reminder',
        groupId: group.id,
      },
    });

    state.lastReminderByGroup[group.id] = now;
    state.remindersToday += 1;
  }

  await saveState(state);
}

/**
 * Snooze reminders for a group for the given number of days.
 */
export async function snoozeGroupReminder(groupId: string, days: number = 7): Promise<void> {
  const state = await getState();
  state.snoozedGroups[groupId] = Date.now() + days * 24 * 60 * 60 * 1000;
  await saveState(state);
}

/**
 * Clear all reminder state (e.g. on sign out).
 */
export async function clearReminderState(): Promise<void> {
  await AsyncStorage.removeItem(REMINDER_STATE_KEY);
}
