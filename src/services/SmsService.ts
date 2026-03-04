import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid } from 'react-native';
import { parseTransactionSms, isBankSender } from './TransactionParser';
import { ParsedTransaction } from '../models/types';

/**
 * SMS Listener Service
 *
 * Uses react-native-get-sms-android to:
 * 1. Request SMS permissions
 * 2. Listen for incoming SMS in real-time
 * 3. Filter bank/payment SMS and parse transactions
 * 4. Callback with parsed transaction for notification handling
 */

type SmsMessage = {
  originatingAddress: string;
  body: string;
  timestamp: number;
};

type TransactionCallback = (parsed: ParsedTransaction) => void;

let smsListener: any = null;
let transactionCallback: TransactionCallback | null = null;

/**
 * Request SMS read permission from the user (Android only).
 */
export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    console.warn('SMS reading is only supported on Android');
    return false;
  }

  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    ]);

    return (
      granted[PermissionsAndroid.PERMISSIONS.READ_SMS] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  } catch (err) {
    console.error('SMS permission request failed:', err);
    return false;
  }
}

/**
 * Start listening for incoming SMS messages.
 * When a transaction SMS is detected, the callback fires with the parsed data.
 */
export function startSmsListener(callback: TransactionCallback): void {
  if (Platform.OS !== 'android') return;

  transactionCallback = callback;

  try {
    const { SmsListenerModule } = NativeModules;
    if (!SmsListenerModule) {
      console.warn('SmsListenerModule not available — using fallback polling');
      startPollingFallback(callback);
      return;
    }

    const emitter = new NativeEventEmitter(SmsListenerModule);

    smsListener = emitter.addListener('onSmsReceived', (message: SmsMessage) => {
      handleIncomingSms(message);
    });

    SmsListenerModule.startListening();
    console.log('SMS listener started');
  } catch (error) {
    console.error('Failed to start SMS listener:', error);
    startPollingFallback(callback);
  }
}

/**
 * Stop listening for SMS messages.
 */
export function stopSmsListener(): void {
  if (smsListener) {
    smsListener.remove();
    smsListener = null;
  }
  transactionCallback = null;

  try {
    const { SmsListenerModule } = NativeModules;
    SmsListenerModule?.stopListening();
  } catch (error) {
    // Ignore cleanup errors
  }
  console.log('SMS listener stopped');
}

/**
 * Process an incoming SMS: check if it's a bank message, parse it,
 * and fire the callback if a debit transaction is detected.
 */
function handleIncomingSms(message: SmsMessage): void {
  const { originatingAddress, body } = message;

  // Quick filter: only process messages from bank-like senders
  if (!isBankSender(originatingAddress)) return;

  const parsed = parseTransactionSms(body, originatingAddress);
  if (parsed && parsed.type === 'debit') {
    transactionCallback?.(parsed);
  }
}

/**
 * Fallback: poll recent SMS every 30 seconds for new transaction messages.
 * Used when the native SMS listener module isn't available.
 */
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let lastCheckedTimestamp = Date.now();

function startPollingFallback(callback: TransactionCallback): void {
  if (Platform.OS !== 'android') return;

  const SmsAndroid = NativeModules.SmsAndroid;
  if (!SmsAndroid) {
    console.warn('SmsAndroid module not available');
    return;
  }

  lastCheckedTimestamp = Date.now();

  pollingInterval = setInterval(() => {
    const filter = {
      box: 'inbox',
      minDate: lastCheckedTimestamp,
      maxCount: 10,
    };

    SmsAndroid.list(
      JSON.stringify(filter),
      (fail: string) => console.error('SMS poll failed:', fail),
      (_count: number, smsList: string) => {
        const messages: Array<{ address: string; body: string; date: number }> =
          JSON.parse(smsList);

        for (const msg of messages) {
          if (!isBankSender(msg.address)) continue;
          const parsed = parseTransactionSms(msg.body, msg.address);
          if (parsed && parsed.type === 'debit') {
            callback(parsed);
          }
        }

        lastCheckedTimestamp = Date.now();
      },
    );
  }, 30000); // Poll every 30 seconds
}

export function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/**
 * Read existing SMS from inbox (for initial scan or history import).
 */
export async function readRecentSms(
  maxCount: number = 50,
): Promise<ParsedTransaction[]> {
  if (Platform.OS !== 'android') return [];

  return new Promise((resolve) => {
    const SmsAndroid = NativeModules.SmsAndroid;
    if (!SmsAndroid) {
      resolve([]);
      return;
    }

    const filter = {
      box: 'inbox',
      maxCount,
    };

    SmsAndroid.list(
      JSON.stringify(filter),
      (_fail: string) => resolve([]),
      (_count: number, smsList: string) => {
        const messages: Array<{ address: string; body: string; date: number }> =
          JSON.parse(smsList);

        const transactions: ParsedTransaction[] = [];
        for (const msg of messages) {
          if (!isBankSender(msg.address)) continue;
          const parsed = parseTransactionSms(msg.body, msg.address);
          if (parsed && parsed.type === 'debit') {
            transactions.push({ ...parsed, timestamp: msg.date });
          }
        }
        resolve(transactions);
      },
    );
  });
}
