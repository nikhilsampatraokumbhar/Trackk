# Trackk — Pre-Release Checklist

> Last updated: 2026-03-10
> Status: NOT READY FOR RELEASE — see blocking items below

---

## BLOCKING — Must Fix Before Any Store Submission

### 1. Payment System — Switch to Production
- [ ] Change `USE_PRODUCTION_PAYMENT` to `true` in `src/services/PaymentService.ts` (line 19)
- [ ] Create Razorpay account at https://dashboard.razorpay.com
- [ ] Obtain production API keys (Key ID + Key Secret)
- [ ] Set secrets in Firebase:
  ```bash
  firebase functions:secrets:set RAZORPAY_KEY_ID
  firebase functions:secrets:set RAZORPAY_KEY_SECRET
  ```
- [ ] Test payment flow end-to-end: order → payment → verification → subscription activation
- [ ] Verify webhook URL in Razorpay dashboard (if using webhooks)

### 2. Android Release Signing — Currently Using Debug Keystore
- [ ] Generate a release keystore:
  ```bash
  keytool -genkey -v -keystore trackk-release.keystore \
    -alias trackk -keyalg RSA -keysize 2048 -validity 10000
  ```
- [ ] **BACK UP THE KEYSTORE SECURELY** — if you lose it, you can never update the app on Play Store
- [ ] Update `android/app/build.gradle` — replace `signingConfigs.debug` in release block with proper release signing config:
  ```gradle
  signingConfigs {
      release {
          storeFile file('trackk-release.keystore')
          storePassword System.getenv('KEYSTORE_PASSWORD') ?: ''
          keyAlias 'trackk'
          keyPassword System.getenv('KEY_PASSWORD') ?: ''
      }
  }
  buildTypes {
      release {
          signingConfig signingConfigs.release
          // ... rest stays the same
      }
  }
  ```
- [ ] **Never commit the keystore to git** — add `*.keystore` to `.gitignore`

### 3. Firebase Cloud Functions — Deploy
- [ ] Upgrade Firebase project to Blaze (pay-as-you-go) plan — required for Cloud Functions
- [ ] Set billing alerts in Google Cloud Console (recommended: $5, $10, $25 thresholds)
- [ ] Install Firebase CLI: `npm install -g firebase-tools`
- [ ] Login: `firebase login`
- [ ] Deploy functions:
  ```bash
  cd functions && npm install && cd ..
  firebase deploy --only functions
  ```
- [ ] Deploy Firestore rules:
  ```bash
  firebase deploy --only firestore:rules
  ```
- [ ] Check Firestore Console for "Suggested indexes" and create them

### 4. Privacy Policy & Terms of Service — Required by Stores
- [ ] Create Privacy Policy covering:
  - SMS reading (what data is read, how it's used, where it's stored)
  - Email access (OAuth scopes, what emails are parsed)
  - Firebase/Firestore data storage (what's synced to cloud)
  - Payment processing (Razorpay handles payment data)
  - No data sold to third parties
  - Data retention and deletion policy
- [ ] Create Terms of Service covering:
  - Payment terms and refund policy
  - Account termination
  - Limitation of liability
- [ ] Host both on a public URL (e.g., GitHub Pages, Notion public page, or your domain)
- [ ] Add the URLs to Play Store listing and app.json

### 5. Remove Debug Features from Production
- [ ] Gate debug diagnostics box behind `__DEV__` in `src/screens/PersonalExpenseScreen.tsx` (lines 93-139):
  ```typescript
  {__DEV__ && Platform.OS === 'android' && (
    // debug box JSX
  )}
  ```
- [ ] Gate "Test Deep Link" button in `src/screens/iOSSetupScreen.tsx` (lines 134-137) behind `__DEV__`
- [ ] Verify `babel-plugin-transform-remove-console` strips console.log in production (already configured in `babel.config.js`)

### 6. App Store Metadata
- [ ] App icon: 1024x1024 PNG (no transparency for Play Store)
- [ ] Feature graphic: 1024x500 for Play Store
- [ ] Screenshots: minimum 2, recommended 4-8 per device type
- [ ] Short description (80 chars for Play Store)
- [ ] Full description (4000 chars max)
- [ ] Category: Finance
- [ ] Content rating questionnaire
- [ ] Add to `app.json`:
  ```json
  "icon": "./src/assets/icon.png",
  "splash": {
    "image": "./src/assets/splash.png",
    "resizeMode": "contain",
    "backgroundColor": "#1A1A2E"
  }
  ```

---

## IMPORTANT — Do Before Release But Not Blocking

### 7. Email OAuth Apps — Register Before Email Feature Goes Live
- [ ] **Gmail:** Create OAuth 2.0 credentials in Google Cloud Console
  - Enable Gmail API
  - Add redirect URI: `trackk://oauth/gmail`
  - Set app to "production" (requires Google verification for sensitive scopes)
  - Submit OAuth consent screen for verification (can take 2-6 weeks)
- [ ] **Outlook:** Register app in Azure Portal (App Registrations)
  - Add redirect URI: `trackk://oauth/outlook`
  - Add API permission: Mail.Read (delegated)
  - Set supported account types: Personal Microsoft accounts + Work/School
- [ ] **Yahoo:** Register app at https://developer.yahoo.com/apps/
  - Add redirect URI: `trackk://oauth/yahoo`
  - Request Mail API read access
- [ ] Set all email OAuth secrets in Firebase:
  ```bash
  firebase functions:secrets:set GMAIL_CLIENT_ID
  firebase functions:secrets:set GMAIL_CLIENT_SECRET
  firebase functions:secrets:set MICROSOFT_CLIENT_ID
  firebase functions:secrets:set MICROSOFT_CLIENT_SECRET
  firebase functions:secrets:set YAHOO_CLIENT_ID
  firebase functions:secrets:set YAHOO_CLIENT_SECRET
  ```
- [ ] Create Gmail Pub/Sub topic:
  ```bash
  gcloud pubsub topics create gmail-transaction-notifications
  gcloud pubsub topics add-iam-policy-binding gmail-transaction-notifications \
    --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
    --role="roles/pubsub.publisher"
  ```
- [ ] Build "Connect Email" UI in the app

### 8. Promo Codes — Server-Side Setup
- [ ] Add promo codes to Firestore `promoCodes` collection:
  ```
  LAUNCH50: { type: "discount", discountPercent: 50, maxUses: 1000, expiresAt: <timestamp> }
  FOUNDING: { type: "full_access", durationDays: 90, maxUses: 500 }
  ```
- [ ] **Remove `NKTEST2026`** test promo code from `src/store/PremiumContext.tsx` (line 138)
- [ ] Verify `__DEV__` guard on `TRACKK_BETA`, `TRACKK_TEST`, `TRACKK_DEV` codes

### 9. Domain & Deep Links
- [ ] Register and set up `trackk.app` domain (or your chosen domain)
- [ ] Configure deep link handling (referral URLs: `https://trackk.app/invite/{code}`)
- [ ] Set up Android App Links (Digital Asset Links file at `/.well-known/assetlinks.json`)
- [ ] Test referral link flow end-to-end

### 10. Update .gitignore
- [ ] Add these entries to `.gitignore`:
  ```
  .env
  .env.*
  *.keystore
  google-services.json
  GoogleService-Info.plist
  functions/.runtimeconfig.json
  ```

---

## TESTING — Complete Before Submitting to Stores

### 11. Functional Testing
- [ ] SMS parsing: test with real bank SMS from at least 5 different banks
- [ ] Transaction notification: tap actions work (Add to Personal, Choose Tracker, Ignore)
- [ ] Group creation, transaction splitting, debt calculation
- [ ] Settlement marking and debt recalculation
- [ ] Savings goals: daily budget, carry-forward, savings jar
- [ ] Budget alerts at each threshold (50%, 75%, 90%, 100%+)
- [ ] Receipt upload via camera and gallery
- [ ] Phone OTP login flow
- [ ] Logout and re-login (data persistence check)

### 12. Payment Testing
- [ ] Create order → pay → verify signature → subscription activated
- [ ] Subscription expiry check (set a short-lived test subscription)
- [ ] Promo code redemption via Cloud Function
- [ ] Founding member pricing (first-time user gets discount)
- [ ] Premium feature gating (free users can't access premium features)

### 13. Edge Case Testing
- [ ] No internet: app works offline (local storage)
- [ ] Slow network: loading states shown, no crashes
- [ ] Permission denied: SMS, notification — graceful degradation
- [ ] Invalid/expired promo codes — proper error messages
- [ ] Concurrent group edits from multiple devices
- [ ] App killed in background — SMS receiver still works
- [ ] App update: data migration (version 1.0.0 → 1.0.1)

### 14. Device Testing
- [ ] Android 10 (API 29) — minimum supported
- [ ] Android 13 (API 33) — notification permission changes
- [ ] Android 14 (API 34) — latest
- [ ] Low-end device (2-3 GB RAM) — performance check
- [ ] Tablet layout (if applicable)

---

## PLAY STORE SUBMISSION

### 15. Google Play Console Setup
- [ ] Create Google Play Developer account ($25 one-time fee)
- [ ] Create app listing in Play Console
- [ ] Fill in store listing (description, screenshots, icon, feature graphic)
- [ ] Complete content rating questionnaire
- [ ] Set up pricing (Free)
- [ ] Add privacy policy URL
- [ ] Select target countries (India first)
- [ ] Complete Data Safety section:
  - SMS data: collected for transaction detection, not shared
  - Email data: collected for transaction detection, not shared
  - Financial data: stored locally + Firebase, not shared
  - Account info: phone number for authentication
- [ ] Upload signed AAB (Android App Bundle):
  ```bash
  cd android && ./gradlew bundleRelease
  ```
  Output: `android/app/build/outputs/bundle/release/app-release.aab`
- [ ] Submit for review (typically 1-7 days)

### 16. Version Management
- [ ] `app.json` version: "1.0.0" (first release)
- [ ] `android.versionCode`: 1 (increment for every update)
- [ ] After first release, always increment both before resubmission

---

## POST-RELEASE

### 17. Monitoring
- [ ] Set up Firebase Crashlytics or Sentry for crash reporting
- [ ] Monitor Cloud Functions logs: `firebase functions:log`
- [ ] Set up Firebase Analytics events for key user actions
- [ ] Monitor Firestore usage and costs in Firebase Console
- [ ] Watch for Razorpay webhook failures

### 18. Quick Wins After Launch
- [ ] Add "Connect Email" UI for reimbursement + foreign trip users
- [ ] Export transactions to CSV/PDF
- [ ] Dark mode toggle
- [ ] Daily spend widget

---

## FILE REFERENCE — What to Change and Where

| Action | File | Line(s) |
|--------|------|---------|
| Switch to production payments | `src/services/PaymentService.ts` | 19 |
| Remove test promo code | `src/store/PremiumContext.tsx` | 138 |
| Gate debug box | `src/screens/PersonalExpenseScreen.tsx` | 93-139 |
| Gate test deep link button | `src/screens/iOSSetupScreen.tsx` | 134-137 |
| Configure release signing | `android/app/build.gradle` | 101-116 |
| Add app icon/splash | `app.json` | root level |
| Update .gitignore | `.gitignore` | append |
| Deploy Cloud Functions | `functions/` | all |
| Deploy Firestore rules | `firestore.rules` | all |
| Connect Email UI | `src/screens/ProfileScreen.tsx` | ~200+ |
| FCM registration | `src/store/AuthContext.tsx` | ~30-50 |
| Email service client | `src/services/EmailService.ts` | all |
| FCM service | `src/services/FcmService.ts` | all |
| iOS GoogleService-Info | `GoogleService-Info.plist` | replace placeholder |
