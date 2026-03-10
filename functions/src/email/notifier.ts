/**
 * FCM Notification Sender
 *
 * Sends push notifications to user devices when a transaction
 * is detected from email parsing. Works for both Android and iOS.
 */

import * as admin from "firebase-admin";
import { ParsedEmailTransaction } from "./types";
import { buildEmailDescription } from "./emailParser";

/**
 * Format currency in INR format.
 */
function formatCurrency(amount: number): string {
  return "₹" + amount.toLocaleString("en-IN", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Send a transaction notification via FCM to all of a user's devices.
 *
 * Stores the parsed transaction in Firestore as a pending transaction
 * so the app can pick it up when the user taps the notification.
 */
export async function sendTransactionNotification(
  uid: string,
  parsed: ParsedEmailTransaction
): Promise<void> {
  const db = admin.firestore();
  const description = buildEmailDescription(parsed);
  const amountStr = formatCurrency(parsed.amount);

  // Store as pending transaction in Firestore
  const pendingRef = db.collection("users").doc(uid)
    .collection("pendingTransactions").doc();

  await pendingRef.set({
    ...parsed,
    description,
    source: "email",
    status: "pending",
    createdAt: Date.now(),
  });

  // Get user's FCM tokens
  const tokensDoc = await db.collection("users").doc(uid)
    .collection("devices").get();

  if (tokensDoc.empty) return;

  const tokens = tokensDoc.docs
    .map((doc) => doc.data().fcmToken as string)
    .filter(Boolean);

  if (tokens.length === 0) return;

  // Build notification
  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title: `${amountStr} ${parsed.bank ? "- " + parsed.bank : ""}`,
      body: description,
    },
    data: {
      type: "email_transaction",
      pendingTransactionId: pendingRef.id,
      amount: String(parsed.amount),
      merchant: parsed.merchant || "",
      bank: parsed.bank || "",
      description,
      source: "email",
    },
    android: {
      priority: "high",
      notification: {
        channelId: "transactions",
        sound: "default",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
          "mutable-content": 1,
          "content-available": 1,
        },
      },
    },
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  // Clean up invalid tokens
  const invalidTokens: string[] = [];
  response.responses.forEach((resp, idx) => {
    if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
      invalidTokens.push(tokens[idx]);
    }
  });

  // Remove invalid tokens from Firestore
  if (invalidTokens.length > 0) {
    const batch = db.batch();
    for (const doc of tokensDoc.docs) {
      if (invalidTokens.includes(doc.data().fcmToken)) {
        batch.delete(doc.ref);
      }
    }
    await batch.commit();
  }
}
