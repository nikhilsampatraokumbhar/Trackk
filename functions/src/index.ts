/**
 * Trackk Cloud Functions
 *
 * Handles:
 * 1. createOrder — Creates a Razorpay order (server-side, keeps key_secret safe)
 * 2. verifyPayment — Verifies Razorpay payment signature
 * 3. validateSubscription — Checks if a user's subscription is active
 * 4. redeemPromoCode — Validates and applies promo codes server-side
 *
 * SETUP:
 * 1. Set Razorpay secrets:
 *    firebase functions:secrets:set RAZORPAY_KEY_ID
 *    firebase functions:secrets:set RAZORPAY_KEY_SECRET
 *
 * 2. Deploy:
 *    cd functions && npm install && cd .. && firebase deploy --only functions
 *
 * 3. Update Firestore rules:
 *    firebase deploy --only firestore:rules
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Razorpay from "razorpay";
import * as crypto from "crypto";

admin.initializeApp();
const db = admin.firestore();

// ─── Secrets (set via: firebase functions:secrets:set RAZORPAY_KEY_ID) ──────
const razorpayKeyId = defineSecret("RAZORPAY_KEY_ID");
const razorpayKeySecret = defineSecret("RAZORPAY_KEY_SECRET");

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
