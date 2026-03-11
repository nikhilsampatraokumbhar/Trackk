/**
 * Trackk Cloud Functions
 *
 * Handles:
 * 1. createOrder — Creates a Razorpay order (server-side, keeps key_secret safe)
 * 2. verifyPayment — Verifies Razorpay payment signature
 * 3. validateSubscription — Checks if a user's subscription is active
 * 4. redeemPromoCode — Validates and applies promo codes server-side
 *
 * Email-based transaction detection (Gmail, Outlook, Yahoo):
 * 5. connectEmail — Exchange OAuth code, set up email watching
 * 6. disconnectEmail — Remove email connection
 * 7. gmailWebhook — Pub/Sub handler for Gmail push notifications
 * 8. outlookWebhook — HTTP handler for Microsoft Graph webhooks
 * 9. renewEmailWatches — Scheduled: renew Gmail/Outlook subscriptions
 * 10. pollYahooEmails — Scheduled: poll Yahoo Mail every 5 minutes
 *
 * SETUP:
 * 1. Set Razorpay secrets:
 *    firebase functions:secrets:set RAZORPAY_KEY_ID
 *    firebase functions:secrets:set RAZORPAY_KEY_SECRET
 *
 * 2. Set email OAuth secrets:
 *    firebase functions:secrets:set GMAIL_CLIENT_ID
 *    firebase functions:secrets:set GMAIL_CLIENT_SECRET
 *    firebase functions:secrets:set MICROSOFT_CLIENT_ID
 *    firebase functions:secrets:set MICROSOFT_CLIENT_SECRET
 *    firebase functions:secrets:set YAHOO_CLIENT_ID
 *    firebase functions:secrets:set YAHOO_CLIENT_SECRET
 *
 * 3. Create Pub/Sub topic for Gmail:
 *    gcloud pubsub topics create gmail-transaction-notifications
 *    gcloud pubsub topics add-iam-policy-binding gmail-transaction-notifications \
 *      --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
 *      --role="roles/pubsub.publisher"
 *
 * 4. Deploy:
 *    cd functions && npm install && cd .. && firebase deploy --only functions
 *
 * 5. Update Firestore rules:
 *    firebase deploy --only firestore:rules
 */

import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Razorpay from "razorpay";
import * as crypto from "crypto";

import { exchangeGmailCode, processGmailNotification, renewGmailWatch, disconnectGmail } from "./email/gmailService";
import { exchangeOutlookCode, processOutlookNotification, renewOutlookWatch, disconnectOutlook } from "./email/outlookService";
import { exchangeYahooCode, pollYahooMail, disconnectYahoo } from "./email/yahooService";

admin.initializeApp();
const db = admin.firestore();

// ─── Secrets ────────────────────────────────────────────────────────────────
const razorpayKeyId = defineSecret("RAZORPAY_KEY_ID");
const razorpayKeySecret = defineSecret("RAZORPAY_KEY_SECRET");

const gmailClientId = defineSecret("GMAIL_CLIENT_ID");
const gmailClientSecret = defineSecret("GMAIL_CLIENT_SECRET");
const microsoftClientId = defineSecret("MICROSOFT_CLIENT_ID");
const microsoftClientSecret = defineSecret("MICROSOFT_CLIENT_SECRET");
const yahooClientId = defineSecret("YAHOO_CLIENT_ID");
const yahooClientSecret = defineSecret("YAHOO_CLIENT_SECRET");

// ─── Plan definitions (mirror of client-side plans) ────────────────────────

interface PlanDef {
  name: string;
  price: number;
  foundingPrice: number;
  periodDays: number;
  isLifetime: boolean;
  isFamily: boolean;
}

const PLANS: Record<string, PlanDef> = {
  premium_monthly: {
    name: "Premium Monthly",
    price: 99,
    foundingPrice: 49,
    periodDays: 30,
    isLifetime: false,
    isFamily: false,
  },
  premium_half_yearly: {
    name: "Premium 6 Months",
    price: 399,
    foundingPrice: 199,
    periodDays: 180,
    isLifetime: false,
    isFamily: false,
  },
  premium_annual: {
    name: "Premium Annual",
    price: 699,
    foundingPrice: 399,
    periodDays: 365,
    isLifetime: false,
    isFamily: false,
  },
  premium_lifetime: {
    name: "Premium Lifetime",
    price: 1999,
    foundingPrice: 1999,
    periodDays: -1,
    isLifetime: true,
    isFamily: false,
  },
  family_monthly: {
    name: "Family Monthly",
    price: 149,
    foundingPrice: 99,
    periodDays: 30,
    isLifetime: false,
    isFamily: true,
  },
  family_annual: {
    name: "Family Annual",
    price: 999,
    foundingPrice: 599,
    periodDays: 365,
    isLifetime: false,
    isFamily: true,
  },
};

// ─── 1. Create Razorpay Order ──────────────────────────────────────────────

export const createOrder = onCall(
  { secrets: [razorpayKeyId, razorpayKeySecret] },
  async (request) => {
    // Auth check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const { planId } = request.data;
    const plan = PLANS[planId];
    if (!plan) {
      throw new HttpsError("invalid-argument", "Invalid plan ID");
    }

    // Check if user is a founding member (subscribed before)
    const subDoc = await db
      .collection("subscriptions")
      .doc(request.auth.uid)
      .get();
    const isFoundingMember = !subDoc.exists;
    const price = isFoundingMember ? plan.foundingPrice : plan.price;

    if (price === 0) {
      throw new HttpsError("invalid-argument", "Cannot create order for free plan");
    }

    // Create Razorpay order
    const razorpay = new Razorpay({
      key_id: razorpayKeyId.value(),
      key_secret: razorpayKeySecret.value(),
    });

    const order = await razorpay.orders.create({
      amount: price * 100, // Razorpay expects paise
      currency: "INR",
      receipt: `trackk_${request.auth.uid}_${Date.now()}`,
      notes: {
        userId: request.auth.uid,
        planId,
        isFoundingMember: String(isFoundingMember),
      },
    });

    return {
      orderId: order.id,
      amount: price,
      currency: "INR",
      keyId: razorpayKeyId.value(),
      isFoundingMember,
    };
  }
);

// ─── 2. Verify Payment & Activate Subscription ────────────────────────────

export const verifyPayment = onCall(
  { secrets: [razorpayKeySecret] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, planId } =
      request.data;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !planId) {
      throw new HttpsError("invalid-argument", "Missing payment details");
    }

    const plan = PLANS[planId];
    if (!plan) {
      throw new HttpsError("invalid-argument", "Invalid plan ID");
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", razorpayKeySecret.value())
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      throw new HttpsError("permission-denied", "Payment verification failed");
    }

    // Payment verified — activate subscription
    const now = Date.now();
    const endDate = plan.isLifetime ? -1 : now + plan.periodDays * 24 * 60 * 60 * 1000;

    // Check if founding member
    const subDoc = await db
      .collection("subscriptions")
      .doc(request.auth.uid)
      .get();
    const isFoundingMember = !subDoc.exists;

    const subscription = {
      planId,
      status: "active",
      startDate: now,
      endDate,
      isFoundingMember,
      razorpayPaymentId,
      razorpayOrderId,
      updatedAt: now,
    };

    await db
      .collection("subscriptions")
      .doc(request.auth.uid)
      .set(subscription, { merge: true });

    return {
      success: true,
      subscription,
    };
  }
);

// ─── 3. Validate Subscription ──────────────────────────────────────────────

export const validateSubscription = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const subDoc = await db
    .collection("subscriptions")
    .doc(request.auth.uid)
    .get();

  if (!subDoc.exists) {
    return { isPremium: false, subscription: null };
  }

  const sub = subDoc.data()!;

  // Check expiry (skip for lifetime: endDate === -1)
  if (sub.endDate !== -1 && sub.endDate < Date.now()) {
    // Expired — update status
    await db.collection("subscriptions").doc(request.auth.uid).update({
      status: "expired",
      updatedAt: Date.now(),
    });
    return { isPremium: false, subscription: { ...sub, status: "expired" } };
  }

  return {
    isPremium: sub.status === "active",
    subscription: sub,
  };
});

// ─── 4. Redeem Promo Code ──────────────────────────────────────────────────

export const redeemPromoCode = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { code } = request.data;
  if (!code || typeof code !== "string") {
    throw new HttpsError("invalid-argument", "Promo code required");
  }

  const upperCode = code.toUpperCase().trim();

  // Look up promo code in Firestore
  const promoDoc = await db.collection("promoCodes").doc(upperCode).get();
  if (!promoDoc.exists) {
    throw new HttpsError("not-found", "Invalid promo code");
  }

  const promo = promoDoc.data()!;

  // Check if expired
  if (promo.expiresAt && promo.expiresAt < Date.now()) {
    throw new HttpsError("failed-precondition", "This promo code has expired");
  }

  // Check usage limit
  if (promo.maxUses && promo.usedCount >= promo.maxUses) {
    throw new HttpsError("resource-exhausted", "This promo code has been fully redeemed");
  }

  // Check if user already used this code
  if (promo.usedBy && promo.usedBy.includes(request.auth.uid)) {
    throw new HttpsError("already-exists", "You have already used this promo code");
  }

  // Apply promo
  const now = Date.now();
  let subscription;

  if (promo.type === "full_access") {
    const endDate = now + (promo.durationDays || 30) * 24 * 60 * 60 * 1000;
    subscription = {
      planId: "promo_" + upperCode.toLowerCase(),
      status: "active",
      startDate: now,
      endDate,
      isFoundingMember: false,
      promoCode: upperCode,
      updatedAt: now,
    };
  } else if (promo.type === "discount") {
    // Return discount info — client applies it to checkout
    return {
      success: true,
      type: "discount",
      discountPercent: promo.discountPercent || 0,
      message: `${promo.discountPercent}% discount applied!`,
    };
  } else {
    throw new HttpsError("internal", "Unknown promo type");
  }

  // Save subscription
  await db
    .collection("subscriptions")
    .doc(request.auth.uid)
    .set(subscription, { merge: true });

  // Update promo usage count
  await db
    .collection("promoCodes")
    .doc(upperCode)
    .update({
      usedCount: admin.firestore.FieldValue.increment(1),
      usedBy: admin.firestore.FieldValue.arrayUnion(request.auth.uid),
    });

  return {
    success: true,
    type: "full_access",
    subscription,
    message: `Premium activated for ${promo.durationDays} days!`,
  };
});

// ─── 5. Connect Email (Gmail / Outlook / Yahoo) ────────────────────────────

export const connectEmail = onCall(
  {
    secrets: [
      gmailClientId, gmailClientSecret,
      microsoftClientId, microsoftClientSecret,
      yahooClientId, yahooClientSecret,
    ],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const { provider, authCode } = request.data;
    if (!provider || !authCode) {
      throw new HttpsError("invalid-argument", "Provider and authCode required");
    }

    try {
      switch (provider) {
        case "gmail":
          return await exchangeGmailCode(
            request.auth.uid,
            authCode,
            gmailClientId.value(),
            gmailClientSecret.value()
          );

        case "outlook": {
          // Build webhook URL for this Firebase project
          const projectId = process.env.GCLOUD_PROJECT || "";
          const webhookUrl = `https://us-central1-${projectId}.cloudfunctions.net/outlookWebhook`;
          return await exchangeOutlookCode(
            request.auth.uid,
            authCode,
            microsoftClientId.value(),
            microsoftClientSecret.value(),
            webhookUrl
          );
        }

        case "yahoo":
          return await exchangeYahooCode(
            request.auth.uid,
            authCode,
            yahooClientId.value(),
            yahooClientSecret.value()
          );

        default:
          throw new HttpsError("invalid-argument", "Unsupported provider: " + provider);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new HttpsError("internal", "Failed to connect email: " + message);
    }
  }
);

// ─── 6. Disconnect Email ────────────────────────────────────────────────────

export const disconnectEmail = onCall(
  { secrets: [microsoftClientId, microsoftClientSecret] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const { provider } = request.data;
    if (!provider) {
      throw new HttpsError("invalid-argument", "Provider required");
    }

    switch (provider) {
      case "gmail":
        await disconnectGmail(request.auth.uid);
        break;
      case "outlook":
        await disconnectOutlook(
          request.auth.uid,
          microsoftClientId.value(),
          microsoftClientSecret.value()
        );
        break;
      case "yahoo":
        await disconnectYahoo(request.auth.uid);
        break;
      default:
        throw new HttpsError("invalid-argument", "Unsupported provider");
    }

    return { success: true };
  }
);

// ─── 7. Gmail Webhook (Pub/Sub) ─────────────────────────────────────────────

export const gmailWebhook = onMessagePublished(
  {
    topic: "gmail-transaction-notifications",
    secrets: [gmailClientId, gmailClientSecret],
  },
  async (event) => {
    const pubsubData = event.data.message.data;
    if (!pubsubData) return;

    await processGmailNotification(
      pubsubData,
      gmailClientId.value(),
      gmailClientSecret.value()
    );
  }
);

// ─── 8. Outlook Webhook (HTTP) ──────────────────────────────────────────────

export const outlookWebhook = onRequest(
  { secrets: [microsoftClientId, microsoftClientSecret] },
  async (req, res) => {
    // Microsoft Graph validation request
    if (req.query.validationToken) {
      res.status(200).send(req.query.validationToken);
      return;
    }

    // Process notifications
    if (req.method === "POST" && req.body?.value) {
      try {
        await processOutlookNotification(
          req.body.value,
          microsoftClientId.value(),
          microsoftClientSecret.value()
        );
      } catch (error) {
        console.error("Outlook webhook error:", error);
      }
    }

    res.status(202).send();
  }
);

// ─── 9. Renew Email Watches (Scheduled — runs daily) ────────────────────────

export const renewEmailWatches = onSchedule(
  {
    schedule: "every 24 hours",
    secrets: [
      gmailClientId, gmailClientSecret,
      microsoftClientId, microsoftClientSecret,
    ],
  },
  async () => {
    const now = Date.now();
    const oneDayFromNow = now + 24 * 60 * 60 * 1000;

    // Renew Gmail watches expiring within 24 hours
    const gmailConnections = await db
      .collectionGroup("emailConnections")
      .where("provider", "==", "gmail")
      .where("watchExpiry", "<", oneDayFromNow)
      .get();

    for (const doc of gmailConnections.docs) {
      const uid = doc.ref.parent.parent!.id;
      try {
        await renewGmailWatch(uid, gmailClientId.value(), gmailClientSecret.value());
      } catch (error) {
        console.error(`Failed to renew Gmail watch for ${uid}:`, error);
      }
    }

    // Renew Outlook subscriptions expiring within 24 hours
    const outlookConnections = await db
      .collectionGroup("emailConnections")
      .where("provider", "==", "outlook")
      .where("watchExpiry", "<", oneDayFromNow)
      .get();

    for (const doc of outlookConnections.docs) {
      const uid = doc.ref.parent.parent!.id;
      try {
        await renewOutlookWatch(uid, microsoftClientId.value(), microsoftClientSecret.value());
      } catch (error) {
        console.error(`Failed to renew Outlook watch for ${uid}:`, error);
      }
    }
  }
);

// ─── 10. Nightly Review Nudge (Scheduled — 9 PM IST daily) ──────────────────

export const nightlyReviewNudge = onSchedule(
  { schedule: "every day 15:30", timeZone: "Asia/Kolkata" }, // 9 PM IST
  async () => {
    const activeSubs = await db
      .collection("subscriptions")
      .where("status", "==", "active")
      .get();

    for (const subDoc of activeSubs.docs) {
      const uid = subDoc.id;
      try {
        const devicesSnap = await db
          .collection("users").doc(uid).collection("devices").get();
        if (devicesSnap.empty) continue;

        const tokens = devicesSnap.docs
          .map((d) => d.data().fcmToken)
          .filter(Boolean);
        if (tokens.length === 0) continue;

        for (const token of tokens) {
          try {
            await admin.messaging().send({
              token,
              notification: {
                title: "Time for your nightly review",
                body: "Review today's transactions and assign them to trackers!",
              },
              data: {
                type: "nightly_review",
                action: "open_nightly_review",
              },
            });
          } catch (tokenError: unknown) {
            const errCode = (tokenError as { code?: string })?.code;
            if (
              errCode === "messaging/invalid-registration-token" ||
              errCode === "messaging/registration-token-not-registered"
            ) {
              await db.collection("users").doc(uid)
                .collection("devices").doc(token).delete();
            }
          }
        }
      } catch (error) {
        console.error(`Nightly nudge failed for ${uid}:`, error);
      }
    }
  }
);

// ─── 11. Poll Yahoo Emails (Scheduled — every 5 minutes) ───────────────────

export const pollYahooEmails = onSchedule(
  {
    schedule: "every 5 minutes",
    secrets: [yahooClientId, yahooClientSecret],
  },
  async () => {
    const yahooConnections = await db
      .collectionGroup("emailConnections")
      .where("provider", "==", "yahoo")
      .get();

    for (const doc of yahooConnections.docs) {
      const uid = doc.ref.parent.parent!.id;
      try {
        await pollYahooMail(uid, yahooClientId.value(), yahooClientSecret.value());
      } catch (error) {
        console.error(`Failed to poll Yahoo for ${uid}:`, error);
      }
    }
  }
);
