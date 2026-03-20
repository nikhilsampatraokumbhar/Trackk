/**
 * Email History Scanner
 *
 * Scans the last 1 year of bank/transaction emails from connected
 * Gmail or Outlook accounts. Returns parsed transactions that can be
 * classified into subscriptions, EMIs, and investments by the client.
 *
 * Called by the mobile app when user taps "Scan" on the
 * Subscriptions/EMIs/Investments screens.
 */

import { google } from "googleapis";
import * as admin from "firebase-admin";
import { EmailConnection, ParsedEmailTransaction } from "./types";
import { parseTransactionEmail } from "./emailParser";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface EmailScanResult {
  transactions: ParsedEmailTransaction[];
  totalScanned: number;
  provider: string;
}

/**
 * Scan Gmail for the last 1 year of bank transaction emails.
 */
async function scanGmailHistory(
  uid: string,
  clientId: string,
  clientSecret: string,
  maxResults: number = 500,
): Promise<EmailScanResult> {
  const db = admin.firestore();
  const connectionDoc = await db
    .collection("users").doc(uid)
    .collection("emailConnections").doc("gmail")
    .get();

  if (!connectionDoc.exists) {
    return { transactions: [], totalScanned: 0, provider: "gmail" };
  }

  const connection = connectionDoc.data() as EmailConnection;

  const oauth2Client = new google.auth.OAuth2(
    clientId, clientSecret, "trackk://oauth/gmail",
  );
  oauth2Client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.tokenExpiry,
  });

  // Auto-refresh tokens
  oauth2Client.on("tokens", async (tokens) => {
    await connectionDoc.ref.update({
      accessToken: tokens.access_token,
      tokenExpiry: tokens.expiry_date,
      updatedAt: Date.now(),
    });
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Search for bank emails from the last year
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const afterDate = oneYearAgo.toISOString().slice(0, 10).replace(/-/g, "/");

  // Build a Gmail search query for known bank senders
  const bankQuery = `after:${afterDate} (from:alerts@ OR from:noreply@ OR from:transactions@ OR from:creditcards@) (debited OR spent OR paid OR EMI OR subscription OR SIP OR investment OR mutual fund OR recurring)`;

  const transactions: ParsedEmailTransaction[] = [];
  let totalScanned = 0;
  let pageToken: string | undefined;

  // Paginate through results
  while (totalScanned < maxResults) {
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: bankQuery,
      maxResults: Math.min(100, maxResults - totalScanned),
      pageToken,
    });

    const messages = listResponse.data.messages || [];
    if (messages.length === 0) break;

    // Fetch each message and parse
    for (const msg of messages) {
      if (!msg.id) continue;
      totalScanned++;

      try {
        const fullMsg = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const headers = fullMsg.data.payload?.headers || [];
        const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
        const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
        const dateHeader = headers.find((h) => h.name?.toLowerCase() === "date")?.value;

        // Extract body
        const body = extractGmailBody(fullMsg.data.payload as Record<string, unknown> | undefined);
        if (!body) continue;

        const parsed = parseTransactionEmail(subject, body, from);
        if (parsed) {
          // Use actual email date instead of Date.now()
          if (dateHeader) {
            const emailDate = new Date(dateHeader).getTime();
            if (!isNaN(emailDate)) {
              parsed.timestamp = emailDate;
            }
          } else if (fullMsg.data.internalDate) {
            parsed.timestamp = parseInt(fullMsg.data.internalDate, 10);
          }
          transactions.push(parsed);
        }
      } catch (e) {
        // Skip individual message errors
        continue;
      }
    }

    pageToken = listResponse.data.nextPageToken || undefined;
    if (!pageToken) break;
  }

  return { transactions, totalScanned, provider: "gmail" };
}

/**
 * Scan Outlook for the last 1 year of bank transaction emails.
 */
async function scanOutlookHistory(
  uid: string,
  clientId: string,
  clientSecret: string,
  maxResults: number = 500,
): Promise<EmailScanResult> {
  const db = admin.firestore();
  const connectionDoc = await db
    .collection("users").doc(uid)
    .collection("emailConnections").doc("outlook")
    .get();

  if (!connectionDoc.exists) {
    return { transactions: [], totalScanned: 0, provider: "outlook" };
  }

  const connection = connectionDoc.data() as EmailConnection;

  // Refresh token if needed
  let accessToken = connection.accessToken;
  if (connection.tokenExpiry < Date.now() + 60000) {
    const tokenResponse = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: connection.refreshToken,
          grant_type: "refresh_token",
          scope: "Mail.Read offline_access",
        }),
      },
    );

    const tokens = await tokenResponse.json() as {
      access_token?: string;
      expires_in?: number;
    };
    if (tokens.access_token) {
      accessToken = tokens.access_token;
      await connectionDoc.ref.update({
        accessToken: tokens.access_token,
        tokenExpiry: Date.now() + (tokens.expires_in || 3600) * 1000,
        updatedAt: Date.now(),
      });
    }
  }

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const filterDate = oneYearAgo.toISOString();

  const transactions: ParsedEmailTransaction[] = [];
  let totalScanned = 0;

  // Search for bank emails using OData filter
  const searchQuery = encodeURIComponent(
    "debited OR spent OR paid OR EMI OR subscription OR SIP OR investment OR mutual fund",
  );
  let url: string | null =
    `${GRAPH_BASE}/me/messages?$filter=receivedDateTime ge ${filterDate}&$search="${searchQuery}"&$top=100&$select=from,subject,body,receivedDateTime&$orderby=receivedDateTime desc`;

  while (url && totalScanned < maxResults) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) break;

    const data = await response.json() as {
      value?: Array<{
        from?: { emailAddress?: { address?: string } };
        subject?: string;
        body?: { content?: string };
        receivedDateTime?: string;
      }>;
      "@odata.nextLink"?: string;
    };
    const messages = data.value || [];
    if (messages.length === 0) break;

    for (const msg of messages) {
      totalScanned++;
      const from = msg.from?.emailAddress?.address || "";
      const subject = msg.subject || "";
      const body = msg.body?.content || "";

      const parsed = parseTransactionEmail(subject, body, from);
      if (parsed) {
        if (msg.receivedDateTime) {
          const emailDate = new Date(msg.receivedDateTime).getTime();
          if (!isNaN(emailDate)) {
            parsed.timestamp = emailDate;
          }
        }
        transactions.push(parsed);
      }
    }

    url = data["@odata.nextLink"] || null;
  }

  return { transactions, totalScanned, provider: "outlook" };
}

/**
 * Scan all connected email accounts for historical transactions.
 * Called by the scanEmailHistory cloud function.
 */
export async function scanAllEmailHistory(
  uid: string,
  gmailClientId: string,
  gmailClientSecret: string,
  microsoftClientId: string,
  microsoftClientSecret: string,
): Promise<{
  transactions: ParsedEmailTransaction[];
  totalScanned: number;
  providers: string[];
}> {
  const results: EmailScanResult[] = [];

  // Scan all connected providers in parallel
  const [gmailResult, outlookResult] = await Promise.allSettled([
    scanGmailHistory(uid, gmailClientId, gmailClientSecret),
    scanOutlookHistory(uid, microsoftClientId, microsoftClientSecret),
  ]);

  if (gmailResult.status === "fulfilled" && gmailResult.value.transactions.length > 0) {
    results.push(gmailResult.value);
  }
  if (outlookResult.status === "fulfilled" && outlookResult.value.transactions.length > 0) {
    results.push(outlookResult.value);
  }

  // Merge and deduplicate
  const allTransactions: ParsedEmailTransaction[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    for (const txn of result.transactions) {
      // Dedup by amount + timestamp (within 5 min window)
      const roundedTs = Math.floor(txn.timestamp / 300000) * 300000;
      const key = `${txn.amount}_${roundedTs}_${txn.merchant || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        allTransactions.push(txn);
      }
    }
  }

  // Sort by timestamp descending
  allTransactions.sort((a, b) => b.timestamp - a.timestamp);

  return {
    transactions: allTransactions,
    totalScanned: results.reduce((sum, r) => sum + r.totalScanned, 0),
    providers: results.map((r) => r.provider),
  };
}

/**
 * Extract the body text from a Gmail message payload.
 */
function extractGmailBody(
  payload: Record<string, unknown> | undefined | null,
): string {
  if (!payload) return "";

  const mimeType = payload.mimeType as string | undefined;
  const body = payload.body as { data?: string } | undefined;
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;

  if (mimeType === "text/plain" && body?.data) {
    return Buffer.from(body.data, "base64").toString("utf-8");
  }
  if (mimeType === "text/html" && body?.data) {
    return Buffer.from(body.data, "base64").toString("utf-8");
  }

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
