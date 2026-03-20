/**
 * Gmail Integration
 *
 * Flow:
 * 1. Client calls exchangeGmailCode with OAuth auth code
 * 2. We exchange for tokens, store in Firestore, set up Gmail push watch
 * 3. Gmail sends Pub/Sub messages when new emails arrive
 * 4. gmailWebhook processes them, parses transactions, sends FCM
 *
 * SETUP:
 * 1. Create OAuth 2.0 credentials in Google Cloud Console
 * 2. Enable Gmail API
 * 3. Create Pub/Sub topic: gmail-transaction-notifications
 * 4. Grant Gmail publish rights to the topic:
 *    gcloud pubsub topics add-iam-policy-binding gmail-transaction-notifications \
 *      --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
 *      --role="roles/pubsub.publisher"
 * 5. Set secrets:
 *    firebase functions:secrets:set GMAIL_CLIENT_ID
 *    firebase functions:secrets:set GMAIL_CLIENT_SECRET
 */

import { google } from "googleapis";
import * as admin from "firebase-admin";
import { EmailConnection } from "./types";
import { parseTransactionEmail } from "./emailParser";
import { sendTransactionNotification } from "./notifier";

/**
 * Create an OAuth2 client with stored credentials.
 */
function createOAuth2Client(clientId: string, clientSecret: string, redirectUri?: string) {
  const projectId = process.env.GCLOUD_PROJECT || "";
  const defaultRedirect = `https://us-central1-${projectId}.cloudfunctions.net/oauthRedirect`;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri || defaultRedirect);
}

/**
 * Exchange authorization code for tokens and set up Gmail watch.
 * Called by the mobile app after user completes OAuth consent.
 */
export async function exchangeGmailCode(
  uid: string,
  authCode: string,
  clientId: string,
  clientSecret: string
): Promise<{ email: string }> {
  const db = admin.firestore();
  const oauth2Client = createOAuth2Client(clientId, clientSecret);

  // Exchange code for tokens
  const { tokens } = await oauth2Client.getToken(authCode);
  oauth2Client.setCredentials(tokens);

  // Get user's email address
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress!;

  // Set up Gmail push notifications
  const watchResponse = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: `projects/${process.env.GCLOUD_PROJECT}/topics/gmail-transaction-notifications`,
      labelIds: ["INBOX"],
    },
  });

  // Store connection in Firestore
  const connection: EmailConnection = {
    provider: "gmail",
    email,
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    tokenExpiry: tokens.expiry_date || Date.now() + 3600000,
    watchExpiry: parseInt(watchResponse.data.expiration || "0"),
    historyId: watchResponse.data.historyId || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db
    .collection("users").doc(uid)
    .collection("emailConnections").doc("gmail")
    .set(connection);

  return { email };
}

/**
 * Process a Gmail Pub/Sub notification.
 * Called when Gmail detects new emails in a watched mailbox.
 */
export async function processGmailNotification(
  pubsubData: string,
  clientId: string,
  clientSecret: string
): Promise<void> {
  // Decode Pub/Sub message
  const decoded = JSON.parse(Buffer.from(pubsubData, "base64").toString());
  const { emailAddress, historyId } = decoded;

  if (!emailAddress || !historyId) return;

  const db = admin.firestore();

  // Find user by email address
  const connectionsQuery = await db
    .collectionGroup("emailConnections")
    .where("provider", "==", "gmail")
    .where("email", "==", emailAddress)
    .limit(1)
    .get();

  if (connectionsQuery.empty) return;

  const connectionDoc = connectionsQuery.docs[0];
  const connection = connectionDoc.data() as EmailConnection;
  const uid = connectionDoc.ref.parent.parent!.id;

  // Set up OAuth client with stored tokens
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.tokenExpiry,
  });

  // Refresh token if needed
  oauth2Client.on("tokens", async (tokens) => {
    await connectionDoc.ref.update({
      accessToken: tokens.access_token,
      tokenExpiry: tokens.expiry_date,
      updatedAt: Date.now(),
    });
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Get new messages since last historyId
  try {
    const history = await gmail.users.history.list({
      userId: "me",
      startHistoryId: connection.historyId || historyId,
      historyTypes: ["messageAdded"],
    });

    if (!history.data.history) return;

    // Collect new message IDs
    const messageIds = new Set<string>();
    for (const record of history.data.history) {
      for (const msg of record.messagesAdded || []) {
        if (msg.message?.id) {
          messageIds.add(msg.message.id);
        }
      }
    }

    // Process each new message
    for (const messageId of messageIds) {
      await processGmailMessage(gmail, uid, messageId);
    }

    // Update historyId
    await connectionDoc.ref.update({
      historyId: history.data.historyId,
      updatedAt: Date.now(),
    });
  } catch (error: unknown) {
    // If historyId is too old, Gmail returns 404. Reset it.
    if (error && typeof error === "object" && "code" in error && (error as { code: number }).code === 404) {
      const profile = await gmail.users.getProfile({ userId: "me" });
      await connectionDoc.ref.update({
        historyId: profile.data.historyId,
        updatedAt: Date.now(),
      });
    } else {
      throw error;
    }
  }
}

/**
 * Fetch and parse a single Gmail message.
 */
async function processGmailMessage(
  gmail: ReturnType<typeof google.gmail>,
  uid: string,
  messageId: string
): Promise<void> {
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = msg.data.payload?.headers || [];
  const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
  const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";

  // Extract body
  const body = extractGmailBody(msg.data.payload as Record<string, unknown> | undefined);
  if (!body) return;

  // Parse transaction
  const parsed = parseTransactionEmail(subject, body, from);
  if (!parsed) return;

  // Check for duplicates (same amount + bank within 5 minutes)
  const db = admin.firestore();
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const dupeCheck = await db
    .collection("users").doc(uid)
    .collection("pendingTransactions")
    .where("amount", "==", parsed.amount)
    .where("bank", "==", parsed.bank)
    .where("createdAt", ">", fiveMinAgo)
    .limit(1)
    .get();

  if (!dupeCheck.empty) return;

  // Send notification
  await sendTransactionNotification(uid, parsed);
}

/**
 * Extract the body text from a Gmail message payload.
 */
function extractGmailBody(
  payload: Record<string, unknown> | undefined | null
): string {
  if (!payload) return "";

  // Type-safe access
  const mimeType = payload.mimeType as string | undefined;
  const body = payload.body as { data?: string } | undefined;
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;

  // Simple message
  if (mimeType === "text/plain" && body?.data) {
    return Buffer.from(body.data, "base64").toString("utf-8");
  }
  if (mimeType === "text/html" && body?.data) {
    return Buffer.from(body.data, "base64").toString("utf-8");
  }

  // Multipart — prefer text/plain, fall back to text/html
  if (parts) {
    let htmlBody = "";
    for (const part of parts) {
      const partMime = part.mimeType as string | undefined;
      const partBody = part.body as { data?: string } | undefined;
      if (partMime === "text/plain" && partBody?.data) {
        return Buffer.from(partBody.data, "base64").toString("utf-8");
      }
      if (partMime === "text/html" && partBody?.data) {
        htmlBody = Buffer.from(partBody.data, "base64").toString("utf-8");
      }
      // Recurse into nested multipart
      const nested = extractGmailBody(part);
      if (nested) {
        if (partMime?.includes("text/plain")) return nested;
        if (!htmlBody) htmlBody = nested;
      }
    }
    return htmlBody;
  }

  return "";
}

/**
 * Renew Gmail push watch (must be called before expiry, typically every 7 days).
 */
export async function renewGmailWatch(
  uid: string,
  clientId: string,
  clientSecret: string
): Promise<void> {
  const db = admin.firestore();
  const connectionDoc = await db
    .collection("users").doc(uid)
    .collection("emailConnections").doc("gmail")
    .get();

  if (!connectionDoc.exists) return;

  const connection = connectionDoc.data() as EmailConnection;
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.tokenExpiry,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const watchResponse = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: `projects/${process.env.GCLOUD_PROJECT}/topics/gmail-transaction-notifications`,
      labelIds: ["INBOX"],
    },
  });

  await connectionDoc.ref.update({
    watchExpiry: parseInt(watchResponse.data.expiration || "0"),
    historyId: watchResponse.data.historyId,
    updatedAt: Date.now(),
  });
}

/**
 * Disconnect Gmail — stop watch and delete stored tokens.
 */
export async function disconnectGmail(uid: string): Promise<void> {
  const db = admin.firestore();
  await db
    .collection("users").doc(uid)
    .collection("emailConnections").doc("gmail")
    .delete();
}
