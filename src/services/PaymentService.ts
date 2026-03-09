/**
 * Payment Service — Client-side payment flow
 *
 * Production flow:
 * 1. Client calls createOrder Cloud Function → gets orderId + keyId
 * 2. Client opens Razorpay checkout with orderId
 * 3. On success, client calls verifyPayment Cloud Function with signature
 * 4. Server verifies signature and activates subscription
 *
 * Development flow:
 * Simulates payment with Alert dialog. Use promo codes for testing.
 */

import { Alert } from 'react-native';
import { PlanId } from '../models/types';
import { PLANS } from '../store/PremiumContext';

// Set to true when Razorpay is set up and Cloud Functions are deployed
const USE_PRODUCTION_PAYMENT = false;

export interface PaymentResult {
  success: boolean;
  orderId?: string;
  paymentId?: string;
  signature?: string;
  error?: string;
}

/**
 * Initiate payment for a subscription plan.
 * In production: calls Cloud Function to create order, then opens Razorpay checkout.
 * In development: shows a simulated payment dialog.
 */
export async function initiatePayment(
  planId: PlanId,
  _userEmail: string,
  userPhone: string,
  userName: string,
): Promise<PaymentResult> {
  const plan = PLANS[planId];

  if (plan.price === 0) {
    return { success: true, orderId: 'free' };
  }

  if (USE_PRODUCTION_PAYMENT) {
    return initiateProductionPayment(planId, userPhone, userName);
  }

  // ── Development: Simulated payment ────────────────────────────────────
  return new Promise((resolve) => {
    Alert.alert(
      'Payment Gateway',
      `Razorpay checkout will open here in production.\n\n` +
      `Plan: ${plan.name}\n` +
      `Amount: ₹${plan.price}\n` +
      `Period: ${plan.period}\n\n` +
      `For testing, use a promo code to activate premium.`,
      [
        { text: 'Cancel', onPress: () => resolve({ success: false, error: 'Cancelled' }) },
        {
          text: 'Simulate Payment',
          onPress: () => resolve({
            success: true,
            orderId: `order_sim_${Date.now()}`,
            paymentId: `pay_sim_${Date.now()}`,
            signature: 'simulated',
          }),
        },
      ],
    );
  });
}

/**
 * Production payment flow using Cloud Functions + Razorpay SDK.
 */
async function initiateProductionPayment(
  planId: PlanId,
  userPhone: string,
  userName: string,
): Promise<PaymentResult> {
  try {
    // Step 1: Create order via Cloud Function
    const { firestore } = require('../services/FirebaseConfig');
    const functions = require('@react-native-firebase/functions').default;
    const createOrderFn = functions().httpsCallable('createOrder');
    const orderResult = await createOrderFn({ planId });
    const { orderId, amount, keyId } = orderResult.data;

    // Step 2: Open Razorpay checkout
    const RazorpayCheckout = require('react-native-razorpay').default;

    const options = {
      description: `Trackk Premium`,
      currency: 'INR',
      key: keyId,
      amount: amount * 100,
      name: 'Trackk',
      order_id: orderId,
      prefill: {
        contact: userPhone,
        name: userName,
      },
      theme: { color: '#C9A84C' },
    };

    const data = await RazorpayCheckout.open(options);

    return {
      success: true,
      orderId: data.razorpay_order_id,
      paymentId: data.razorpay_payment_id,
      signature: data.razorpay_signature,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.description || error?.message || 'Payment failed',
    };
  }
}

/**
 * Verify payment via Cloud Function.
 * Server verifies Razorpay signature and activates the subscription in Firestore.
 */
export async function verifyPaymentServer(
  paymentId: string,
  orderId: string,
  signature: string,
  planId: PlanId,
): Promise<{ success: boolean; subscription?: any }> {
  if (!USE_PRODUCTION_PAYMENT) {
    // Dev mode — always succeed
    return { success: true };
  }

  try {
    const functions = require('@react-native-firebase/functions').default;
    const verifyFn = functions().httpsCallable('verifyPayment');
    const result = await verifyFn({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      planId,
    });
    return result.data;
  } catch (error: any) {
    return { success: false };
  }
}

/**
 * Check subscription status from server.
 */
export async function checkSubscriptionServer(): Promise<{
  isPremium: boolean;
  subscription: any | null;
}> {
  if (!USE_PRODUCTION_PAYMENT) {
    return { isPremium: false, subscription: null };
  }

  try {
    const functions = require('@react-native-firebase/functions').default;
    const validateFn = functions().httpsCallable('validateSubscription');
    const result = await validateFn({});
    return result.data;
  } catch {
    return { isPremium: false, subscription: null };
  }
}

/**
 * Redeem promo code via Cloud Function.
 */
export async function redeemPromoCodeServer(
  code: string,
): Promise<{ success: boolean; message?: string; subscription?: any; type?: string; discountPercent?: number }> {
  if (!USE_PRODUCTION_PAYMENT) {
    // In dev mode, fall back to client-side promo handling
    return { success: false, message: 'Server promo validation disabled in dev mode' };
  }

  try {
    const functions = require('@react-native-firebase/functions').default;
    const redeemFn = functions().httpsCallable('redeemPromoCode');
    const result = await redeemFn({ code });
    return result.data;
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Invalid promo code',
    };
  }
}
