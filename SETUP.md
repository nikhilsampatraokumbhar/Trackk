# Expense Tracker - Setup Guide

## Prerequisites

1. **Node.js** (v18+): https://nodejs.org
2. **Android Studio**: https://developer.android.com/studio
   - During installation, make sure to install:
     - Android SDK
     - Android SDK Platform-Tools
     - Android Virtual Device (AVD)
3. **JDK 17**: Usually comes with Android Studio

## Step 1: Create React Native Project

```bash
# Install React Native CLI globally
npm install -g react-native-cli

# Create the project (from parent directory of ExpenseTracker)
npx react-native init ExpenseTracker --template react-native-template-typescript

# Copy the src/ folder and App.tsx from this scaffold into the created project
```

## Step 2: Install Dependencies

```bash
cd ExpenseTracker
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npm install react-native-screens react-native-safe-area-context
npm install @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore @react-native-firebase/messaging
npm install @notifee/react-native
npm install react-native-get-sms-android
npm install @react-native-async-storage/async-storage
npm install react-native-vector-icons
npm install react-native-permissions
```

## Step 3: Firebase Setup

1. Go to https://console.firebase.google.com
2. Click **"Create a project"**
3. Name it "ExpenseTracker" (or anything you like)
4. **Enable Authentication:**
   - Go to Authentication → Sign-in method
   - Enable **"Anonymous"** sign-in
5. **Enable Firestore:**
   - Go to Firestore Database → Create database
   - Start in **test mode** (for development)
   - Choose a region close to you
6. **Add Android App:**
   - Click the Android icon on the project overview
   - Package name: `com.expensetracker` (must match your android/app/build.gradle)
   - Download the `google-services.json` file
   - Place it in `android/app/google-services.json`

## Step 4: Android Configuration

### android/build.gradle
Add to `buildscript.dependencies`:
```gradle
classpath 'com.google.gms:google-services:4.4.0'
```

### android/app/build.gradle
Add at the bottom:
```gradle
apply plugin: 'com.google.gms.google-services'
```

### android/app/src/main/AndroidManifest.xml
Add these permissions:
```xml
<uses-permission android:name="android.permission.READ_SMS" />
<uses-permission android:name="android.permission.RECEIVE_SMS" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

## Step 5: Run the App

```bash
# Start Metro bundler
npx react-native start

# In another terminal, run on Android
npx react-native run-android
```

## Step 6: Test Transaction Detection

To test without waiting for real bank SMS, you can use Android's ADB to send a fake SMS:

```bash
# Open Android Studio terminal or your PC terminal
adb emu sms send "HDFCBK" "Your a/c XX1234 has been debited for Rs.500.00 at AMAZON on 01-03-2026. Avl bal: Rs.12,345.67"
```

This will trigger the SMS parser and show an actionable notification!

## How the App Works

### Transaction Flow
```
Bank SMS arrives
     ↓
SMS Listener detects it
     ↓
Transaction Parser extracts amount, merchant, bank
     ↓
Check active trackers
     ↓
┌─────────────────────────┬──────────────────────────┐
│ 1 tracker active        │ 2+ trackers active       │
│                         │                          │
│ Notification:           │ Notification:            │
│ "₹500 debited"         │ "₹500 debited"          │
│ [Add to Personal]      │ [Choose Tracker (2)]     │
│ [Ignore]               │ [Ignore]                 │
│                         │                          │
│ Tap "Add" → saved!     │ Tap → opens dialog       │
│                         │ Select tracker → saved!  │
└─────────────────────────┴──────────────────────────┘
```

### Group Split Flow
```
Transaction added to group
     ↓
Amount ÷ number of members = split per person
     ↓
e.g., ₹1000 with 4 members = ₹250 each
     ↓
Payer's split auto-marked as "settled"
     ↓
Others see "You owe ₹250 to [payer]"
     ↓
Debt calculator simplifies: A→B ₹100, B→C ₹50 = A→C ₹50, A→B ₹50
```
