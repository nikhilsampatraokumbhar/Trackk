/**
 * OutlookService — Microsoft Outlook/Exchange email tracking for reimbursement.
 *
 * Flow:
 *   1. User connects their work Outlook account via Microsoft OAuth
 *   2. On every app foreground (reimbursement tracker ON), we poll for bank emails
 *   3. New emails are parsed with the same regex logic as SMS/Gmail
 *   4. Each detected transaction surfaces via the same notification/dialog flow
 *
 * Developer setup (one-time):
 *   • Azure Portal → App Registrations → New registration
 *   • Add redirect URI: iOS → "com.expensetracker://auth" (type: Public client/native)
 *   • API Permissions → Add "Mail.Read" (Microsoft Graph, Delegated)
 *   • Copy the Application (client) ID → paste into AZURE_CLIENT_ID below
 *   • iOS Info.plist → add URL scheme "com.expensetracker" under CFBundleURLSchemes
 *   • Run: cd ios && pod install
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { authorize, refresh, revoke, AuthorizeResult } from 'react-native-app-auth';
import { parseTransactionSms } from './TransactionParser';
import { ParsedTransaction } from '../models/types';

// ─────────────────────────────────────────────────────────────────────────────
// DEV MOCK — set false once Azure App Registration is configured
// ─────────────────────────────────────────────────────────────────────────────
const DEV_MOCK_OUTLOOK = true;

// Mock transactions returned when DEV_MOCK_OUTLOOK = true
const MOCK_OUTLOOK_TRANSACTIONS: ParsedTransaction[] = [
  {
    amount: 2400,
    type: 'debit',
    merchant: 'IndiGo Airlines',
    bank: 'HDFC',
    rawMessage: '[Outlook] Your HDFC Bank Credit Card ending 4242 has been used for ₹2,400.00 at INDIGO AIRLINES on 04-03-2026.',
    timestamp: Date.now() - 2 * 60 * 60 * 1000,
    source: 'email',
  },
  {
    amount: 850,
    type: 'debit',
    merchant: 'Uber',
    bank: 'ICICI',
    rawMessage: '[Outlook] INR 850.00 spent on ICICI Bank Credit Card ending 1234 at UBER on 03-03-2026.',
    timestamp: Date.now() - 26 * 60 * 60 * 1000,
    source: 'email',
  },
  {
    amount: 3150,
    type: 'debit',
    merchant: 'Taj Hotels',
    bank: 'Axis',
    rawMessage: '[Outlook] Your Axis Bank Credit Card ending 9876 was used for INR 3,150.00 at TAJ HOTELS on 02-03-2026.',
    timestamp: Date.now() - 50 * 60 * 60 * 1000,
    source: 'email',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURE THIS — paste your Azure App Registration client ID here
// ─────────────────────────────────────────────────────────────────────────────
const AZURE_CLIENT_ID = 'YOUR_AZURE_APP_REGISTRATION_CLIENT_ID';

const OUTLOOK_AUTH_CONFIG = {
  issuer: 'https://login.microsoftonline.com/common/v2.0',
  clientId: AZURE_CLIENT_ID,
  redirectUrl: 'com.expensetracker://auth',
  scopes: ['openid', 'offline_access', 'https://graph.microsoft.com/Mail.Read'],
  serviceConfiguration: {
    authorizationEndpoint:
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    revocationEndpoint:
      'https://login.microsoftonline.com/common/oauth2/v2.0/logout',
  },
};

const OUTLOOK_TOKEN_KEY = '@outlook_auth_token';
const OUTLOOK_PROCESSED_IDS_KEY = '@outlook_processed_ids';

// ── Bank email sender filter (same as EmailService) ───────────────────────────

const BANK_EMAIL_DOMAINS = [
  'hdfcbank.net', 'hdfcbank.com', 'icicibank.com', 'sbi.co.in',
  'axisbank.com', 'kotak.com', 'yesbank.in', 'indusind.com',
  'federalbank.co.in', 'idfcfirstbank.com', 'aubank.in',
  'rblbank.com', 'sc.com', 'pnb.co.in', 'unionbankofindia.co.in',
  'canarabank.in', 'paytmbank.com',
];

function isBankEmailSender(from: string): boolean {
  const lower = from.toLowerCase();
  return BANK_EMAIL_DOMAINS.some(domain => lower.includes(domain));
}

// ── Token storage ─────────────────────────────────────────────────────────────

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpirationDate: string;
}

async function saveTokens(result: AuthorizeResult): Promise<void> {
  const tokens: StoredTokens = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? '',
    accessTokenExpirationDate: result.accessTokenExpirationDate,
  };
  await AsyncStorage.setItem(OUTLOOK_TOKEN_KEY, JSON.stringify(tokens));
}

async function getAccessToken(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(OUTLOOK_TOKEN_KEY);
  if (!stored) return null;

  const tokens: StoredTokens = JSON.parse(stored);
  const expiry = new Date(tokens.accessTokenExpirationDate).getTime();

  // Use existing token if not expiring in the next 60 seconds
  if (Date.now() < expiry - 60_000) {
    return tokens.accessToken;
  }

  // Token expired — try to refresh silently
  try {
    const refreshed = await refresh(OUTLOOK_AUTH_CONFIG, {
      refreshToken: tokens.refreshToken,
    });
    await saveTokens(refreshed as unknown as AuthorizeResult);
    return refreshed.accessToken;
  } catch {
    // Refresh failed (user revoked access, etc.) — clear stored tokens
    await AsyncStorage.removeItem(OUTLOOK_TOKEN_KEY);
    return null;
  }
}

// ── Public auth API ───────────────────────────────────────────────────────────

/**
 * Open Microsoft sign-in and request Mail.Read.
 * Returns the signed-in email address, or null if cancelled.
 */
export async function connectOutlook(): Promise<string | null> {
  if (DEV_MOCK_OUTLOOK) {
    await new Promise(r => setTimeout(r, 900)); // simulate OAuth round-trip
    return 'dev.user@company.com';
  }
  try {
    const result = await authorize(OUTLOOK_AUTH_CONFIG);
    await saveTokens(result);

    // Decode the id_token to extract the email / UPN
    const [, payloadB64] = result.idToken?.split('.') ?? [];
    if (payloadB64) {
      try {
        const payload = JSON.parse(atob(payloadB64));
        return payload.email ?? payload.preferred_username ?? null;
      } catch { /* fall through */ }
    }

    // Fallback: query Microsoft Graph /me
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${result.accessToken}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      return me.mail ?? me.userPrincipalName ?? null;
    }
    return null;
  } catch (err: any) {
    const msg = err?.message?.toLowerCase() ?? '';
    if (msg.includes('cancel') || msg.includes('dismiss') || msg.includes('user_cancel')) {
      return null;
    }
    throw err;
  }
}

/** Revoke tokens and clear all stored data. */
export async function disconnectOutlook(): Promise<void> {
  if (DEV_MOCK_OUTLOOK) {
    await AsyncStorage.multiRemove([OUTLOOK_TOKEN_KEY, OUTLOOK_PROCESSED_IDS_KEY]);
    return;
  }
  try {
    const stored = await AsyncStorage.getItem(OUTLOOK_TOKEN_KEY);
    if (stored) {
      const tokens: StoredTokens = JSON.parse(stored);
      await revoke(OUTLOOK_AUTH_CONFIG, { tokenToRevoke: tokens.accessToken, sendClientId: true });
    }
  } catch { /* ignore — user may already be signed out */ }

  await AsyncStorage.multiRemove([OUTLOOK_TOKEN_KEY, OUTLOOK_PROCESSED_IDS_KEY]);
}

// ── Email polling ─────────────────────────────────────────────────────────────

/**
 * Polls the Microsoft Graph API for new bank transaction emails from the last 3 days.
 * Deduplicates against already-processed message IDs in AsyncStorage.
 * Returns ParsedTransaction[] for any new debits found.
 */
export async function fetchNewOutlookTransactionEmails(): Promise<ParsedTransaction[]> {
  if (DEV_MOCK_OUTLOOK) {
    await new Promise(r => setTimeout(r, 600));
    return MOCK_OUTLOOK_TRANSACTIONS;
  }
  const accessToken = await getAccessToken();
  if (!accessToken) return [];

  // Filter to last 3 days
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const url =
    'https://graph.microsoft.com/v1.0/me/messages' +
    `?$filter=receivedDateTime ge ${threeDaysAgo}` +
    '&$select=id,subject,from,receivedDateTime,body' +
    '&$top=50' +
    '&$orderby=receivedDateTime desc';

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.warn('[OutlookService] Graph API failed:', res.status);
    return [];
  }

  const data = await res.json();
  const messages: any[] = data.value ?? [];

  const storedRaw = await AsyncStorage.getItem(OUTLOOK_PROCESSED_IDS_KEY);
  const processedIds = new Set<string>(storedRaw ? JSON.parse(storedRaw) : []);

  const results: ParsedTransaction[] = [];

  for (const msg of messages) {
    if (processedIds.has(msg.id)) continue;

    const fromEmail: string = msg.from?.emailAddress?.address ?? '';
    if (!isBankEmailSender(fromEmail)) {
      processedIds.add(msg.id);
      continue;
    }

    const subject: string = msg.subject ?? '';
    const rawBody: string = msg.body?.content ?? '';
    const bodyText =
      msg.body?.contentType === 'html'
        ? rawBody
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim()
        : rawBody;

    const fullText = `${subject}\n${bodyText}`;
    const senderDomain = fromEmail.split('@')[1] ?? '';

    const parsed = parseTransactionSms(fullText, senderDomain);
    if (parsed) {
      const ts = new Date(msg.receivedDateTime).getTime();
      results.push({
        ...parsed,
        rawMessage: `[Outlook] ${subject}\n${bodyText.slice(0, 400)}`,
        timestamp: ts || Date.now(),
        source: 'email',
      });
    }

    processedIds.add(msg.id);
  }

  // Cap stored IDs at 1000 to avoid unbounded AsyncStorage growth
  const trimmed = [...processedIds].slice(-1000);
  await AsyncStorage.setItem(OUTLOOK_PROCESSED_IDS_KEY, JSON.stringify(trimmed));

  return results;
}
