import { Linking, Platform } from 'react-native';
import { ParsedTransaction } from '../models/types';

const URL_SCHEME = 'trackk://';

type TransactionCallback = (parsed: ParsedTransaction) => void;

let onTransactionReceived: TransactionCallback | null = null;

/**
 * Parse a Trackk deep link URL into a ParsedTransaction.
 * Expected format: trackk://transaction?amount=500&merchant=Swiggy&bank=HDFC&message=...
 */
function parseDeepLink(url: string): ParsedTransaction | null {
  try {
    if (!url.startsWith(URL_SCHEME)) return null;

    const path = url.replace(URL_SCHEME, '');
    const [route, queryString] = path.split('?');

    if (route !== 'transaction' || !queryString) return null;

    const params = new URLSearchParams(queryString);
    const amount = parseFloat(params.get('amount') || '0');

    if (amount <= 0) return null;

    return {
      amount,
      type: 'debit',
      merchant: params.get('merchant') || undefined,
      bank: params.get('bank') || undefined,
      rawMessage: params.get('message') || `Deep link: Rs.${amount}`,
      timestamp: parseInt(params.get('timestamp') || String(Date.now()), 10),
    };
  } catch {
    return null;
  }
}

/**
 * Handle an incoming deep link URL.
 */
function handleDeepLink(event: { url: string }): void {
  const parsed = parseDeepLink(event.url);
  if (parsed && onTransactionReceived) {
    console.log('[Trackk] Deep link transaction received:', parsed.amount);
    onTransactionReceived(parsed);
  }
}

/**
 * Initialize deep link listening. Call once at app startup.
 */
export function initDeepLinkListener(callback: TransactionCallback): () => void {
  onTransactionReceived = callback;

  // Handle deep link that launched the app (cold start)
  Linking.getInitialURL().then(url => {
    if (url) handleDeepLink({ url });
  });

  // Handle deep links while app is open
  const subscription = Linking.addEventListener('url', handleDeepLink);

  return () => {
    onTransactionReceived = null;
    subscription.remove();
  };
}

/**
 * Check if the current platform supports native SMS reading.
 */
export function supportsNativeSms(): boolean {
  return Platform.OS === 'android';
}

/**
 * Check if this platform needs iOS Shortcuts setup.
 */
export function needsShortcutSetup(): boolean {
  return Platform.OS === 'ios';
}

/**
 * Generate the Shortcuts automation instructions for the user.
 */
export function getShortcutSetupInstructions(): string[] {
  return [
    'Open the Shortcuts app on your iPhone',
    'Tap the Automation tab at the bottom',
    'Tap + to create a new automation',
    'Select "Message" as the trigger',
    'Set "Message Contains" to: debited',
    'Set "Run Immediately" and turn off "Notify When Run"',
    'Add action: "Open URLs"',
    'Set the URL to:\ntrackk://transaction?amount=[AMOUNT]&merchant=[MERCHANT]&message=[SHORTCUT INPUT]',
    'Replace [AMOUNT] and [MERCHANT] with extracted values using Shortcuts text parsing',
    'Repeat with trigger word "spent" for more coverage',
  ];
}

/**
 * Get the URL scheme for testing.
 */
export function getTestDeepLink(): string {
  return 'trackk://transaction?amount=299&merchant=Test+Store&bank=HDFC+Bank&message=test+transaction';
}
