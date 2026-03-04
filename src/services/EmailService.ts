/**
 * EmailService — Gmail-based transaction detection for iOS.
 *
 * Flow:
 *   1. User connects their Gmail account via Google OAuth (gmail.readonly scope)
 *   2. On every app foreground, we poll Gmail for bank emails from the last 3 days
 *   3. New emails (not yet processed) are parsed with the same regex logic as SMS
 *   4. Each detected transaction is surfaced via the same notification/dialog flow
 *
 * Setup required (one-time, by developer):
 *   • Google Cloud Console → Create OAuth 2.0 Web client → copy the client ID
 *   • Replace WEB_CLIENT_ID below with that value
 *   • iOS: run `cd ios && pod install` after npm install
 *   • iOS GoogleService-Info.plist must be present (already needed for Firebase)
 *   • Android: no extra steps (auto-linked)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { parseTransactionSms } from './TransactionParser';
import { ParsedTransaction } from '../models/types';

// ─────────────────────────────────────────────────────────────────────────────
// DEV MOCK — set false once Google Cloud Console is configured
// ─────────────────────────────────────────────────────────────────────────────
const DEV_MOCK_GMAIL = true;

// Mock transactions returned when DEV_MOCK_GMAIL = true
const MOCK_GMAIL_TRANSACTIONS: ParsedTransaction[] = [
  {
    amount: 450,
    type: 'debit',
    merchant: 'Swiggy',
    bank: 'HDFC',
    rawMessage: '[Email] Your HDFC Bank Debit Card ending 5678 has been used for ₹450.00 at SWIGGY on 04-03-2026.',
    timestamp: Date.now() - 1 * 60 * 60 * 1000,
    source: 'email',
  },
  {
    amount: 1200,
    type: 'debit',
    merchant: 'Amazon',
    bank: 'SBI',
    rawMessage: '[Email] Your SBI account has been debited by Rs.1200.00 towards Amazon payment on 04-03-2026.',
    timestamp: Date.now() - 5 * 60 * 60 * 1000,
    source: 'email',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURE THIS — replace with your Google Cloud Console web client ID
// ─────────────────────────────────────────────────────────────────────────────
const WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID_FROM_GOOGLE_CLOUD_CONSOLE.apps.googleusercontent.com';

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

/** Call once at app start (before any sign-in attempt). */
export function setupGoogleSignIn(): void {
  GoogleSignin.configure({
    scopes: GMAIL_SCOPES,
    webClientId: WEB_CLIENT_ID,
    offlineAccess: false,
  });
}

// ── Bank email senders ────────────────────────────────────────────────────────

/**
 * Known Indian bank / payment alert email domains.
 * We match on domain suffix so subdomains (alerts@, noreply@, etc.) all match.
 */
const BANK_EMAIL_DOMAINS = [
  'hdfcbank.net',
  'hdfcbank.com',
  'icicibank.com',
  'sbi.co.in',
  'axisbank.com',
  'kotak.com',
  'yesbank.in',
  'indusind.com',
  'federalbank.co.in',
  'idfcfirstbank.com',
  'aubank.in',
  'rblbank.com',
  'sc.com',       // Standard Chartered
  'pnb.co.in',
  'unionbankofindia.co.in',
  'canarabank.in',
  'paytmbank.com',
];

// Gmail search query — bank senders only, last 3 days
const GMAIL_SEARCH_QUERY = `(${BANK_EMAIL_DOMAINS.map(d => `from:${d}`).join(' OR ')}) newer_than:3d`;

// AsyncStorage key for already-processed Gmail message IDs
const PROCESSED_IDS_KEY = '@gmail_processed_ids';

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Prompt the user to sign in with Google and grant gmail.readonly access.
 * Returns the user's Gmail address on success, null if cancelled.
 */
export async function connectGmail(): Promise<string | null> {
  if (DEV_MOCK_GMAIL) {
    await new Promise(r => setTimeout(r, 900)); // simulate OAuth round-trip
    return 'testuser@gmail.com';
  }
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();
    return userInfo.data?.user.email ?? null;
  } catch (error: any) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED) return null;
    if (error.code === statusCodes.IN_PROGRESS) return null;
    throw error;
  }
}

/** Sign out and clear processed-ID cache. */
export async function disconnectGmail(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Ignore — user may already be signed out
  }
  await AsyncStorage.removeItem(PROCESSED_IDS_KEY);
}

/**
 * Re-authenticate silently (no UI).
 * Returns the email if still signed in, null otherwise.
 */
export async function silentGmailSignIn(): Promise<string | null> {
  try {
    const userInfo = await GoogleSignin.signInSilently();
    return userInfo.data?.user.email ?? null;
  } catch {
    return null;
  }
}

// ── Gmail REST helpers ────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const tokens = await GoogleSignin.getTokens();
  return tokens.accessToken;
}

function decodeBase64Url(encoded: string): string {
  // Gmail uses base64url (- instead of +, _ instead of /)
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  try {
    // atob is available globally in React Native 0.73+
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
  } catch {
    return '';
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractBodyFromPayload(payload: any): string {
  if (!payload) return '';

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }

  if (payload.parts) {
    // Prefer plain text
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (plain?.body?.data) return decodeBase64Url(plain.body.data);

    const html = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data));

    // Recurse into nested multipart
    for (const part of payload.parts) {
      const text = extractBodyFromPayload(part);
      if (text) return text;
    }
  }
  return '';
}

function getHeader(headers: any[], name: string): string {
  const h = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

function extractSenderDomain(fromHeader: string): string {
  const emailMatch = fromHeader.match(/<([^>]+)>/) ?? fromHeader.match(/([^\s]+@[^\s]+)/);
  const email = emailMatch ? emailMatch[1].toLowerCase() : fromHeader.toLowerCase();
  const domainMatch = email.match(/@(.+)$/);
  return domainMatch ? domainMatch[1] : '';
}

function isBankEmailSender(fromHeader: string): boolean {
  const domain = extractSenderDomain(fromHeader);
  return BANK_EMAIL_DOMAINS.some(bankDomain => domain.endsWith(bankDomain));
}

// ── Main poll function ────────────────────────────────────────────────────────

/**
 * Polls Gmail for new bank transaction emails.
 * Deduplicates against already-processed message IDs stored in AsyncStorage.
 * Returns ParsedTransaction[] for any new debit transactions found.
 *
 * Designed to be called on every app foreground event — cheap because the
 * processed-ID cache prevents re-parsing the same email twice.
 */
export async function fetchNewBankTransactionEmails(): Promise<ParsedTransaction[]> {
  if (DEV_MOCK_GMAIL) {
    await new Promise(r => setTimeout(r, 600)); // simulate poll latency
    return MOCK_GMAIL_TRANSACTIONS;
  }
  const accessToken = await getAccessToken();

  // ── Step 1: List matching messages ──
  const listUrl =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages` +
    `?q=${encodeURIComponent(GMAIL_SEARCH_QUERY)}&maxResults=30`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    console.warn('[EmailService] Gmail list failed:', listRes.status);
    return [];
  }

  const listData = await listRes.json();
  const messages: { id: string }[] = listData.messages ?? [];
  if (messages.length === 0) return [];

  // ── Step 2: Filter to un-processed IDs ──
  const storedRaw = await AsyncStorage.getItem(PROCESSED_IDS_KEY);
  const processedIds = new Set<string>(storedRaw ? JSON.parse(storedRaw) : []);
  const newIds = messages.map(m => m.id).filter(id => !processedIds.has(id));

  if (newIds.length === 0) return [];

  // ── Step 3: Fetch each new email and parse ──
  const results: ParsedTransaction[] = [];

  for (const msgId of newIds) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!msgRes.ok) {
        processedIds.add(msgId); // mark so we don't retry failures endlessly
        continue;
      }

      const msg = await msgRes.json();
      const headers: any[] = msg.payload?.headers ?? [];
      const fromHeader = getHeader(headers, 'from');
      const subject = getHeader(headers, 'subject');

      // Reject non-bank emails that slipped through the query
      if (!isBankEmailSender(fromHeader)) {
        processedIds.add(msgId);
        continue;
      }

      const body = extractBodyFromPayload(msg.payload);
      // Combine subject + body so the SMS parser can pick up amount from either
      const fullText = `${subject}\n${body}`;
      const senderDomain = extractSenderDomain(fromHeader);

      // Reuse the same regex parser as SMS — same keywords + amount patterns
      const parsed = parseTransactionSms(fullText, senderDomain);
      if (parsed) {
        const emailTimestamp = parseInt(msg.internalDate ?? '0', 10);
        results.push({
          ...parsed,
          // Truncate raw body to keep Firestore doc size reasonable
          rawMessage: `[Email] ${subject}\n${body.slice(0, 400)}`,
          timestamp: emailTimestamp || Date.now(),
        });
      }

      processedIds.add(msgId);
    } catch (err) {
      console.warn('[EmailService] Failed to process message', msgId, err);
      // Don't add to processedIds — will retry next poll
    }
  }

  // ── Step 4: Persist updated processed-ID set (cap at 1000) ──
  const trimmed = [...processedIds].slice(-1000);
  await AsyncStorage.setItem(PROCESSED_IDS_KEY, JSON.stringify(trimmed));

  return results;
}
