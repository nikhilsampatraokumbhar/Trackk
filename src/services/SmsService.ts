import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { ParsedTransaction } from '../models/types';
import { isBankSender, parseTransactionSms } from './TransactionParser';

type SmsCallback = (parsed: ParsedTransaction) => void;

let smsListener: any = null;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let lastSmsTimestamp = 0;
let activeCallback: SmsCallback | null = null;
let hasNativeListener = false;

export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const readResult = await request(PERMISSIONS.ANDROID.READ_SMS);
    const receiveResult = await request(PERMISSIONS.ANDROID.RECEIVE_SMS);
    return (
      readResult === RESULTS.GRANTED && receiveResult === RESULTS.GRANTED
    );
  } catch {
    return false;
  }
}

export async function checkSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const result = await check(PERMISSIONS.ANDROID.READ_SMS);
    return result === RESULTS.GRANTED;
  } catch {
    return false;
  }
}

function handleIncomingSms(message: { body: string; originatingAddress: string }) {
  console.log('[Trackk] SMS received from:', message.originatingAddress);
  if (!activeCallback) {
    console.log('[Trackk] No active callback - SMS ignored');
    return;
  }
  const { body, originatingAddress } = message;
  const isBankMsg = isBankSender(originatingAddress);
  console.log('[Trackk] Is bank sender:', isBankMsg);
  if (!isBankMsg) return;
  const parsed = parseTransactionSms(body, originatingAddress);
  console.log('[Trackk] Parsed:', parsed ? `Rs.${parsed.amount}` : 'null');
  if (parsed) {
    lastSmsTimestamp = parsed.timestamp;
    activeCallback(parsed);
  }
}

export function startSmsListener(callback: SmsCallback): void {
  activeCallback = callback;
  hasNativeListener = false;
  console.log('[Trackk] Starting SMS listener...');
  console.log('[Trackk] SmsListenerModule available:', !!NativeModules.SmsListenerModule);
  console.log('[Trackk] SmsAndroid available:', !!NativeModules.SmsAndroid);

  // Primary: native event-driven listener (zero battery cost — OS triggers callback)
  try {
    if (NativeModules.SmsListenerModule) {
      const emitter = new NativeEventEmitter(NativeModules.SmsListenerModule);
      smsListener = emitter.addListener('onSmsReceived', handleIncomingSms);
      hasNativeListener = true;
      console.log('[Trackk] Native SMS listener attached (event-driven, low battery)');
    } else {
      console.log('[Trackk] SmsListenerModule NOT found in NativeModules');
    }
  } catch (e: any) {
    console.log('[Trackk] SMS listener error:', e.message);
  }

  // One-time catch-up: read any SMS that arrived while app was closed
  // This does NOT repeat — it's a single read on startup
  catchUpMissedSms(callback);

  // Fallback: only use polling if native listener is NOT available
  // Uses a conservative 60-second interval to minimize battery impact
  if (!hasNativeListener) {
    startPollingFallback(callback);
  }
}

export function stopSmsListener(): void {
  activeCallback = null;
  hasNativeListener = false;
  if (smsListener) {
    smsListener.remove();
    smsListener = null;
  }
  stopPolling();
}

/**
 * One-time read of recent SMS to catch transactions that arrived
 * while the app was not running. Only runs once on listener start.
 */
async function catchUpMissedSms(callback: SmsCallback): Promise<void> {
  lastSmsTimestamp = Date.now() - 60000; // check last 60s
  try {
    await readRecentSms(10, callback);
  } catch (e) {
    // Catch-up failed silently
  }
}

/**
 * Fallback polling — only used when native SmsListenerModule is unavailable.
 * Uses 60-second interval (6x less frequent than before) to save battery.
 */
function startPollingFallback(callback: SmsCallback): void {
  if (pollingInterval) return;
  console.log('[Trackk] Using polling fallback (60s interval)');

  pollingInterval = setInterval(async () => {
    try {
      await readRecentSms(10, callback);
    } catch (e) {
      // Polling failed silently
    }
  }, 60000); // 60 seconds instead of 10
}

function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

export async function readRecentSms(
  maxCount: number = 50,
  callback?: SmsCallback,
): Promise<void> {
  if (!NativeModules.SmsAndroid) return;

  return new Promise(resolve => {
    const filter = {
      box: 'inbox',
      maxCount,
      minDate: lastSmsTimestamp,
    };

    NativeModules.SmsAndroid.list(
      JSON.stringify(filter),
      (fail: string) => {
        console.log('SMS read error:', fail);
        resolve();
      },
      (_count: number, smsList: string) => {
        const messages: Array<{ body: string; address: string; date: string }> =
          JSON.parse(smsList);

        let latestDate = lastSmsTimestamp;

        for (const sms of messages) {
          const msgDate = parseInt(sms.date, 10);
          if (msgDate > lastSmsTimestamp) {
            if (isBankSender(sms.address)) {
              const parsed = parseTransactionSms(sms.body, sms.address);
              if (parsed && callback) {
                callback(parsed);
              }
            }
            if (msgDate > latestDate) latestDate = msgDate;
          }
        }

        lastSmsTimestamp = latestDate > lastSmsTimestamp ? latestDate : lastSmsTimestamp;
        resolve();
      },
    );
  });
}

/**
 * Returns whether the app is using the battery-efficient native listener
 * vs the polling fallback.
 */
export function isUsingNativeListener(): boolean {
  return hasNativeListener;
}
