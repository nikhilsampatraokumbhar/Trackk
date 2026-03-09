# Trackk — Project TODO

> Last updated: 2026-03-09

---

## Completed

### Core Features
- [x] SMS auto-detection for 20+ Indian banks (SBI, HDFC, ICICI, Axis, Kotak, Paytm, GPay, etc.)
- [x] Transaction parsing (amount, merchant, bank, type)
- [x] Personal expense tracking with categories and tags
- [x] Group expense splitting with debt calculation
- [x] Settlement tracking and reimbursement screen
- [x] Savings goals with streak tiers and carry-forward leftovers
- [x] Budget management (overall + per-category)
- [x] Insights & analytics (spending by category, trends)
- [x] Receipt upload for transactions
- [x] Deep link support (referral invites, app links)

### Premium & Monetization
- [x] 5 individual plans (Free, Monthly, Half-Yearly, Annual, Lifetime)
- [x] 2 family plans (Monthly, Annual) with up to 4 members
- [x] Founding member pricing
- [x] Promo code system (client-side: LAUNCH50, FOUNDING)
- [x] Referral system (share code, earn 1 month free per referral, up to 12 months)
- [x] Pricing screen with plan comparison

### Auth & Cloud
- [x] Firebase Auth (phone OTP login)
- [x] Firestore cloud sync for groups
- [x] AsyncStorage local-first data storage
- [x] Context API state management (Auth, Group, Tracker, Premium)

### Backend (Firebase Cloud Functions)
- [x] `createOrder` — Razorpay order creation (server-side key security)
- [x] `verifyPayment` — HMAC-SHA256 signature verification + subscription activation
- [x] `validateSubscription` — Subscription status & expiry checking
- [x] `redeemPromoCode` — Server-side promo code validation
- [x] Firestore security rules (membership checks, server-only writes for subscriptions)

### Quality & Performance
- [x] Security audit fixes (removed key_secret from client, __DEV__ flag for dev promos)
- [x] Performance optimizations (useMemo on all context providers, React.memo on TransactionCard)
- [x] Accessibility fixes (WCAG AA color contrast, 44px touch targets, loading states)
- [x] babel-plugin-transform-remove-console for production builds
- [x] 116 unit/integration tests passing (6 test suites)
- [x] SMS notification deduplication

### Build & CI
- [x] EAS Build configuration
- [x] GitHub Actions APK build workflow
- [x] Firebase project configuration (.firebaserc, firebase.json)

---

## Pending — Pre-Launch

### Payment Integration (Priority 1)
- [ ] Set up Firebase Blaze plan (required for Cloud Functions)
- [ ] Install Firebase CLI (`npm install -g firebase-tools`)
- [ ] Set Razorpay secrets:
  ```
  firebase functions:secrets:set RAZORPAY_KEY_ID
  firebase functions:secrets:set RAZORPAY_KEY_SECRET
  ```
- [ ] Deploy Cloud Functions: `cd functions && npm install && cd .. && firebase deploy --only functions`
- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
- [ ] Flip `USE_PRODUCTION_PAYMENT` to `true` in `src/services/PaymentService.ts`
- [ ] End-to-end test: payment → verification → subscription activation

### Promo Codes (Priority 1)
- [ ] Add promo codes to Firestore `promoCodes` collection for server-side validation
- [ ] **REMOVE `NKTEST2026` test promo code before public launch** (`src/store/PremiumContext.tsx:138`)

### Testing (Priority 2)
- [ ] Build release APK and test with `NKTEST2026` promo code
- [ ] Test all premium features in release build
- [ ] Test payment flow end-to-end (after Razorpay setup)
- [ ] Test group sync across multiple devices
- [ ] Test SMS parsing with real bank messages on release APK
- [ ] Edge case testing (network failures, expired subscriptions, invalid promo codes)

### Polish (Priority 3)
- [ ] App icon and splash screen finalization
- [ ] Play Store listing assets (screenshots, description, feature graphic)
- [ ] Privacy policy and terms of service pages
- [ ] Rate/review prompt after positive usage milestones

---

## Backlog — Post-Launch

### Features
- [ ] Export transactions to CSV/PDF
- [ ] Recurring expense tracking
- [ ] Multi-currency support
- [ ] Dark/light theme toggle
- [ ] Widgets (daily spend, budget remaining)
- [ ] iOS release

### Technical Debt
- [ ] Migrate from AsyncStorage to MMKV for faster local storage
- [ ] Add E2E tests (Detox or Maestro)
- [ ] Add Crashlytics / Sentry for error monitoring
- [ ] Server-side analytics (usage metrics, funnel tracking)
- [ ] CI pipeline for automated testing on PR

---

## Architecture Notes

- **Local-first**: Personal expenses stored in AsyncStorage, groups synced via Firestore
- **Payment security**: Razorpay key_secret never on client; all payment verification server-side via Cloud Functions
- **Dev vs Prod**: `USE_PRODUCTION_PAYMENT` flag in PaymentService.ts; dev promo codes behind `__DEV__`
- **State management**: Context API + useMemo optimization (no Redux needed at current scale)
