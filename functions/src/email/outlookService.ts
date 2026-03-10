/**
 * Outlook / Microsoft 365 Integration
 *
 * Flow:
 * 1. Client calls exchangeOutlookCode with OAuth auth code
 * 2. We exchange for tokens, store in Firestore, create Graph subscription
 * 3. Microsoft Graph sends webhook notifications for new emails
 * 4. outlookWebhook processes them, parses transactions, sends FCM
 *
 * SETUP:
 * 1. Register app in Azure Portal (App Registrations)
 * 2. Add redirect URI: trackk://oauth/outlook
 * 3. Add API permission: Mail.Read (delegated)
 * 4. Set secrets:
 *    firebase functions:secrets:set MICROSOFT_CLIENT_ID
 *    firebase functions:secrets:set MICROSOFT_CLIENT_SECRET
 */

import * as admin from "firebase-admin";
import { EmailConnection } from "./types";
import { parseTransactionEmail } from "./emailParser";
import { sendTransactionNotification } from "./notifier";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";
const SCOPES = "Mail.Read offline_access openid email";

/**
 * Exchange authorization code for tokens and create Graph mail subscription.
 */
export async function exchangeOutlookCode(
  uid: string,
  authCode: string,
  clientId: string,
  clientSecret: string,
  webhookUrl: string
): Promise<{ email: string }> {
  const db = admin.firestore();

  // Exchange code for tokens
  const tokenResponse = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: authCode,
      redirect_uri: "trackk://oauth/outlook",
      grant_type: "authorization_code",
      scope: SCOPES,
    }),
  });

  const tokens = await tokenResponse.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  if (!tokens.access_token) {
    throw new Error("Failed to exchange Outlook auth code");
  }

  // Get user's email
  const profileResponse = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileResponse.json() as { mail?: string; userPrincipalName?: string };
  const email = profile.mail || profile.userPrincipalName || "";

  // Create mail subscription (webhook)
  const expiryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days max
  const subscriptionResponse = await fetch(`${GRAPH_BASE}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changeType: "created",
      notificationUrl: webhookUrl,
      resource: "me/mailFolders('Inbox')/messages",
      expirationDateTime: expiryDate.toISOString(),
      clientState: uid, // Used to verify webhook authenticity
    }),
  });

  const subscription = await subscriptionResponse.json() as { id?: string };

  // Store connection
  const connection: EmailConnection = {
    provider: "outlook",
    email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
    watchExpiry: expiryDate.getTime(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db
    .collection("users").doc(uid)
    .collection("emailConnections").doc("outlook")
    .set(connection);

  // Store subscription ID for renewal/deletion
  if (subscription.id) {
    await db
      .collection("users").doc(uid)
      .collection("emailConnections").doc("outlook")
      .update({ subscriptionId: subscription.id });
  }

  return { email };
}

/**
 * Refresh Outlook access token using stored refresh token.
 */
async function refreshOutlookToken(
  connection: EmailConnection,
  connectionRef: FirebaseFirestore.DocumentReference,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const response = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES,
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
 * Process an Outlook webhook notification.
 * Microsoft sends notifications when new emails arrive.
 */
export async function processOutlookNotification(
  notifications: Array<{
    clientState: string;
    resource: string;
    resourceData?: { id?: string };
  }>,
  clientId: string,
  clientSecret: string
): Promise<void> {
  const db = admin.firestore();

  for (const notification of notifications) {
    const uid = notification.clientState;
    if (!uid) continue;

    const connectionDoc = await db
      .collection("users").doc(uid)
      .collection("emailConnections").doc("outlook")
      .get();

    if (!connectionDoc.exists) continue;

    const connection = connectionDoc.data() as EmailConnection;

    // Refresh token if needed
    let accessToken = connection.accessToken;
    if (Date.now() > connection.tokenExpiry - 60000) {
      accessToken = await refreshOutlookToken(
        connection, connectionDoc.ref, clientId, clientSecret
      );
    }

    // Get the new email
    const messageId = notification.resourceData?.id;
    if (!messageId) continue;

    const msgResponse = await fetch(
      `${GRAPH_BASE}/me/messages/${messageId}?$select=from,subject,body`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const msg = await msgResponse.json() as {
      from?: { emailAddress?: { address?: string } };
      subject?: string;
      body?: { content?: string };
    };

    const from = msg.from?.emailAddress?.address || "";
    const subject = msg.subject || "";
    const body = msg.body?.content || "";

    // Parse transaction
    const parsed = parseTransactionEmail(subject, body, from);
    if (!parsed) continue;

    // Dedup check
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
}

/**
 * Renew Outlook Graph subscription (must be renewed every 3 days max).
 */
export async function renewOutlookWatch(
  uid: string,
  clientId: string,
  clientSecret: string
): Promise<void> {
  const db = admin.firestore();
  const connectionDoc = await db
    .collection("users").doc(uid)
    .collection("emailConnections").doc("outlook")
    .get();

  if (!connectionDoc.exists) return;

  const connection = connectionDoc.data() as EmailConnection & { subscriptionId?: string };
  if (!connection.subscriptionId) return;

  // Refresh token if needed
  let accessToken = connection.accessToken;
  if (Date.now() > connection.tokenExpiry - 60000) {
    accessToken = await refreshOutlookToken(
      connection, connectionDoc.ref, clientId, clientSecret
    );
  }

  const expiryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  await fetch(`${GRAPH_BASE}/subscriptions/${connection.subscriptionId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expirationDateTime: expiryDate.toISOString(),
    }),
  });

  await connectionDoc.ref.update({
    watchExpiry: expiryDate.getTime(),
    updatedAt: Date.now(),
  });
}

/**
 * Disconnect Outlook — delete subscription and stored tokens.
 */
export async function disconnectOutlook(
  uid: string,
  clientId: string,
  clientSecret: string
): Promise<void> {
  const db = admin.firestore();
  const connectionDoc = await db
    .collection("users").doc(uid)
    .collection("emailConnections").doc("outlook")
    .get();

  if (!connectionDoc.exists) return;

  const connection = connectionDoc.data() as EmailConnection & { subscriptionId?: string };

  // Delete Graph subscription
  if (connection.subscriptionId) {
    let accessToken = connection.accessToken;
    if (Date.now() > connection.tokenExpiry - 60000) {
      accessToken = await refreshOutlookToken(
        connection, connectionDoc.ref, clientId, clientSecret
      );
    }

    await fetch(`${GRAPH_BASE}/subscriptions/${connection.subscriptionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  await connectionDoc.ref.delete();
}
