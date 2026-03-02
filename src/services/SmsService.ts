import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { ParsedTransaction } from '../models/types';
import { isBankSender, parseTransactionSms } from './TransactionParser';

type SmsCallback = (parsed: ParsedTransaction) => void;

let smsListener: any = null;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let lastSmsTimestamp = 0;
let activeCallback: SmsCallback | null = null;

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
  if (!activeCallback) return;
  const { body, originatingAddress } = message;
  if (!isBankSender(originatingAddress)) return;
  const parsed = parseTransactionSms(body, originatingAddress);
  if (parsed) {
    // Mark this timestamp so the polling fallback skips this same SMS
    lastSmsTimestamp = parsed.timestamp;
    activeCallback(parsed);
  }
}

export function startSmsListener(callback: SmsCallback): void {
  activeCallback = callback;

  try {
    if (NativeModules.SmsListenerModule) {
      const emitter = new NativeEventEmitter(NativeModules.SmsListenerModule);
      smsListener = emitter.addListener('onSmsReceived', handleIncomingSms);
    }
  } catch (e) {
    console.log('SMS listener module not available, using polling fallback');
  }

  startPollingFallback(callback);
}

export function stopSmsListener(): void {
  activeCallback = null;
  if (smsListener) {
    smsListener.remove();
    smsListener = null;
  }
  stopPolling();
}

function startPollingFallback(callback: SmsCallback): void {
  if (pollingInterval) return;
  lastSmsTimestamp = Date.now() - 60000; // check last 60s on first run

  pollingInterval = setInterval(async () => {
    try {
      await readRecentSms(20, callback);
    } catch (e) {
      // Polling failed silently
    }
  }, 10000);
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
