/**
 * Yahoo Mail Integration
 *
 * Yahoo doesn't support push notifications/webhooks for mail.
 * We use OAuth2 + periodic polling via Yahoo Mail REST API (IMAP-like).
 *
 * Flow:
 * 1. Client calls exchangeYahooCode with OAuth auth code
 * 2. We exchange for tokens, store in Firestore
 * 3. Scheduled function polls for new emails every 5 minutes
 * 4. New bank emails are parsed and FCM notifications sent
 *
 * SETUP:
 * 1. Create app at https://developer.yahoo.com/apps/
 * 2. Add redirect URI: trackk://oauth/yahoo
 * 3. Request Mail API read access
 * 4. Set secrets:
 *    firebase functions:secrets:set YAHOO_CLIENT_ID
 *    firebase functions:secrets:set YAHOO_CLIENT_SECRET
 */

import * as admin from "firebase-admin";
import { EmailConnection } from "./types";
import { isBankEmail, parseTransactionEmail } from "./emailParser";
import { sendTransactionNotification } from "./notifier";

const AUTH_BASE = "https://api.login.yahoo.com/oauth2";
const MAIL_API_BASE = "https://mail.yahooapis.com/ws/mail/v3.0";

/**
 * Exchange Yahoo OAuth authorization code for tokens.
 */
export async function exchangeYahooCode(
  uid: string,
  authCode: string,
  clientId: string,
  clientSecret: string
): Promise<{ email: string }> {
  const db = admin.firestore();

  // Exchange code for tokens
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenResponse = await fetch(`${AUTH_BASE}/get_token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code: authCode,
      redirect_uri: "trackk://oauth/yahoo",
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenResponse.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    xoauth_yahoo_guid?: string;
  };

  if (!tokens.access_token) {
    throw new Error("Failed to exchange Yahoo auth code");
  }

  // Get user's email via Yahoo profile API
  const profileResponse = await fetch(
    "https://api.login.yahoo.com/openid/v1/userinfo",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  );
  const profile = await profileResponse.json() as { email?: string };
  const email = profile.email || "";

  // Store connection
  const connection: EmailConnection = {
    provider: "yahoo",
    email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
    lastChecked: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db
    .collection("users").doc(uid)
    .collection("emailConnections").doc("yahoo")
    .set(connection);

  return { email };
}

/**
 * Refresh Yahoo access token.
 */
async function refreshYahooToken(
  connection: EmailConnection,
  connectionRef: FirebaseFirestore.DocumentReference,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${AUTH_BASE}/get_token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokens = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  await connectionRef.update({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || connection.refreshToken,
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
    updatedAt: Date.now(),
  });

  return tokens.access_token;
}

/**
 * Poll Yahoo Mail for new bank transaction emails.
 * Called by the scheduled function every 5 minutes.
 */
export async function pollYahooMail(
  uid: string,
  clientId: string,
  clientSecret: string
): Promise<void> {
  const db = admin.firestore();
  const connectionDoc = await db
    .collection("users").doc(uid)
    .collection("emailConnections").doc("yahoo")
    .get();

  if (!connectionDoc.exists) return;

  const connection = connectionDoc.data() as EmailConnection;

  // Refresh token if needed
  let accessToken = connection.accessToken;
  if (Date.now() > connection.tokenExpiry - 60000) {
    accessToken = await refreshYahooToken(
      connection, connectionDoc.ref, clientId, clientSecret
    );
  }

  // Yahoo Mail API: list recent messages in inbox
  // Using Yahoo's REST Mail API to get messages since last check
  const sinceTimestamp = connection.lastChecked || Date.now() - 5 * 60 * 1000;

  // Fetch recent inbox messages
  const listResponse = await fetch(
    `${MAIL_API_BASE}/jsonrpc`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "ListMessages",
        params: [
          {
            fid: "Inbox",
            numMid: 20, // Last 20 messages
            sortKey: "date",
            sortOrder: "down",
            groupBy: "unRead",
          },
        ],
      }),
    }
  );

  if (!listResponse.ok) {
    // Yahoo Mail API might not be available — fall back gracefully
    await connectionDoc.ref.update({
      lastChecked: Date.now(),
      updatedAt: Date.now(),
    });
    return;
  }

  const listData = await listResponse.json() as {
    result?: {
      messageInfo?: Array<{
        mid: string;
        from?: { email?: string };
        subject?: string;
        receivedDate?: number;
      }>;
    };
  };

  const messages = listData.result?.messageInfo || [];

  for (const msg of messages) {
    // Skip messages older than last check
    if (msg.receivedDate && msg.receivedDate * 1000 < sinceTimestamp) continue;

    const from = msg.from?.email || "";
    if (!isBankEmail(from)) continue;

    // Fetch full message body
    const msgResponse = await fetch(`${MAIL_API_BASE}/jsonrpc`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "GetMessage",
        params: [{ mid: msg.mid }],
      }),
    });

    if (!msgResponse.ok) continue;

    const msgData = await msgResponse.json() as {
      result?: { textBody?: string; htmlBody?: string };
    };

    const body = msgData.result?.textBody || msgData.result?.htmlBody || "";
    const subject = msg.subject || "";

    const parsed = parseTransactionEmail(subject, body, from);
    if (!parsed) continue;

    // Dedup
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const dupeCheck = await db
      .collection("users").doc(uid)
      .collection("pendingTransactions")
      .where("amount", "==", parsed.amount)
      .where("bank", "==", parsed.bank)
      .where("createdAt", ">", fiveMinAgo)
      .limit(1)
      .get();

    if (!dupeCheck.empty) continue;

    await sendTransactionNotification(uid, parsed);
  }

  // Update last checked timestamp
  await connectionDoc.ref.update({
    lastChecked: Date.now(),
    updatedAt: Date.now(),
  });
}

/**
 * Disconnect Yahoo — delete stored tokens.
 */
export async function disconnectYahoo(uid: string): Promise<void> {
  const db = admin.firestore();
  await db
    .collection("users").doc(uid)
    .collection("emailConnections").doc("yahoo")
    .delete();
}
