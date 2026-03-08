/**
 * Razorpay Payment Service
 *
 * Setup instructions:
 * 1. Create a Razorpay account at https://razorpay.com
 * 2. Complete KYC with: PAN card, Aadhaar, bank account details
 * 3. Get your API keys from Dashboard > Settings > API Keys
 * 4. Replace the placeholder keys below
 *
 * Required npm package (install when ready for production):
 *   npx expo install react-native-razorpay
 *
 * For now, this service simulates payment flow and returns mock responses.
 */

import { Alert } from 'react-native';
import { PlanId } from '../models/types';
import { PLANS, FOUNDING_PRICES } from '../store/PremiumContext';

// ─── Razorpay Configuration ─────────────────────────────────────────────────
// Replace these with your actual Razorpay keys
const RAZORPAY_CONFIG = {
  key_id: 'rzp_test_PLACEHOLDER_KEY',    // Test key - replace with live key for production
  key_secret: 'PLACEHOLDER_SECRET',       // Never expose in production client code
  currency: 'INR',
  company_name: 'Trackk',
  company_logo: '', // URL to your logo
  theme_color: '#C9A84C',
};

// ─── Plan to Razorpay Plan ID mapping ───────────────────────────────────────
// Create these plans in your Razorpay dashboard
const RAZORPAY_PLAN_IDS: Partial<Record<PlanId, string>> = {
  premium_monthly: 'plan_PLACEHOLDER_premium_monthly',
  premium_annual:  'plan_PLACEHOLDER_premium_annual',
  family_monthly:  'plan_PLACEHOLDER_family_monthly',
  family_annual:   'plan_PLACEHOLDER_family_annual',
};

export interface PaymentResult {
  success: boolean;
  orderId?: string;
  paymentId?: string;
  error?: string;
}

/**
 * Initiate a Razorpay checkout for a subscription plan.
 *
 * In production, you would:
 * 1. Call your backend to create a Razorpay order
 * 2. Open Razorpay checkout with the order ID
 * 3. Handle the payment response
 * 4. Verify payment on your backend
 */
export async function initiatePayment(
  planId: PlanId,
  userEmail: string,
  userPhone: string,
  userName: string,
): Promise<PaymentResult> {
  const plan = PLANS[planId];
  const price = FOUNDING_PRICES[planId] || plan.price;

  if (price === 0) {
    return { success: true, orderId: 'free' };
  }

  // ── Production Razorpay flow (uncomment when razorpay is installed) ──
  /*
  try {
    const RazorpayCheckout = require('react-native-razorpay').default;

    const options = {
      description: `Trackk ${plan.name} Subscription`,
      image: RAZORPAY_CONFIG.company_logo,
      currency: RAZORPAY_CONFIG.currency,
      key: RAZORPAY_CONFIG.key_id,
      amount: price * 100, // Razorpay expects amount in paise
      name: RAZORPAY_CONFIG.company_name,
      prefill: {
        email: userEmail,
        contact: userPhone,
        name: userName,
      },
      theme: { color: RAZORPAY_CONFIG.theme_color },
      // For subscriptions, use subscription_id instead of amount:
      // subscription_id: RAZORPAY_PLAN_IDS[planId],
    };

    const data = await RazorpayCheckout.open(options);
    return {
      success: true,
      paymentId: data.razorpay_payment_id,
      orderId: data.razorpay_order_id,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.description || error?.message || 'Payment failed',
    };
  }
  */

  // ── Simulated payment (for development/testing) ───────────────────────
  return new Promise((resolve) => {
    Alert.alert(
      'Payment Gateway',
      `Razorpay checkout will open here in production.\n\n` +
      `Plan: ${plan.name}\n` +
      `Amount: ₹${price}\n` +
      `Period: ${plan.period}\n\n` +
      `For testing, use promo code TRACKK_DEV for unlimited premium access.`,
      [
        { text: 'Cancel', onPress: () => resolve({ success: false, error: 'Cancelled' }) },
        {
          text: 'Simulate Payment',
          onPress: () => resolve({
            success: true,
            orderId: `order_sim_${Date.now()}`,
            paymentId: `pay_sim_${Date.now()}`,
          }),
        },
      ],
    );
  });
}

/**
 * Verify a payment with the backend.
 * In production, send the payment details to your server for verification.
 */
export async function verifyPayment(
  paymentId: string,
  orderId: string,
): Promise<boolean> {
  // In production:
  // const response = await fetch('https://your-backend.com/api/verify-payment', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ paymentId, orderId }),
  // });
  // return response.ok;

  // Simulated verification
  return true;
}

/**
 * Get Razorpay setup instructions for the developer.
 */
export function getRazorpaySetupInstructions(): string {
  return `
Razorpay Setup Guide for Trackk:

1. ACCOUNT SETUP:
   - Go to https://razorpay.com and create an account
   - Complete KYC verification:
     • PAN Card (Individual or Business)
     • Bank Account (Account number + IFSC)
     • Aadhaar for identity verification
     • GST Number (optional, but reduces TDS)

2. API KEYS:
   - Dashboard → Settings → API Keys → Generate Key
   - Test keys start with 'rzp_test_'
   - Live keys start with 'rzp_live_'

3. INSTALL SDK:
   npx expo install react-native-razorpay

4. CREATE SUBSCRIPTION PLANS:
   Dashboard → Subscriptions → Plans → Create Plan
   Create these plans:
   - Premium Monthly: ₹99/month (founding: ₹49)
   - Premium Annual: ₹699/year (founding: ₹399)
   - Family Monthly: ₹149/month (founding: ₹99)
   - Family Annual: ₹999/year (founding: ₹599)
   - Premium Lifetime: ₹1,499 one-time

5. WEBHOOK (for auto-renewal):
   Dashboard → Settings → Webhooks
   URL: https://your-backend.com/api/razorpay-webhook
   Events: payment.captured, subscription.charged, subscription.cancelled

6. UPDATE THIS FILE:
   Replace RAZORPAY_CONFIG keys with your actual keys
   Replace RAZORPAY_PLAN_IDS with your created plan IDs
`;
}
