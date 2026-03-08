// ─── Firebase Configuration ─────────────────────────────────────────────────
//
// SETUP GUIDE:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (or use existing)
// 3. Enable Authentication → Phone sign-in method
// 4. Enable Cloud Firestore (start in test mode, then add rules)
// 5. Add an Android app with your package name
// 6. Add an iOS app with your bundle ID
// 7. Download google-services.json (Android) and GoogleService-Info.plist (iOS)
// 8. Replace the config values below with your project's config
//
// Required packages (already in package.json):
//   @react-native-firebase/app
//   @react-native-firebase/auth
//   @react-native-firebase/firestore
//
// Firestore Security Rules (paste in Firebase Console → Firestore → Rules):
// ```
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     // Users can read/write their own profile
//     match /users/{userId} {
//       allow read, write: if request.auth != null && request.auth.uid == userId;
//       allow read: if request.auth != null;
//     }
//     // Group members can read/write group data
//     match /groups/{groupId} {
//       allow read, write: if request.auth != null
//         && request.auth.uid in resource.data.memberIds;
//       allow create: if request.auth != null;
//     }
//     match /groups/{groupId}/{sub=**} {
//       allow read, write: if request.auth != null;
//     }
//   }
// }
// ```
// ─────────────────────────────────────────────────────────────────────────────

import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

// Firebase is auto-configured via google-services.json (Android)
// and GoogleService-Info.plist (iOS). No manual config needed here
// as long as those files are in the right place.

export { firebase, auth, firestore };

// ─── Firestore Collection References ────────────────────────────────────────

export const db = {
  users: () => firestore().collection('users'),
  user: (uid: string) => firestore().collection('users').doc(uid),

  groups: () => firestore().collection('groups'),
  group: (groupId: string) => firestore().collection('groups').doc(groupId),

  groupTransactions: (groupId: string) =>
    firestore().collection('groups').doc(groupId).collection('transactions'),
  groupTransaction: (groupId: string, txnId: string) =>
    firestore().collection('groups').doc(groupId).collection('transactions').doc(txnId),

  settlements: (groupId: string) =>
    firestore().collection('groups').doc(groupId).collection('settlements'),
  settlement: (groupId: string, settlementId: string) =>
    firestore().collection('groups').doc(groupId).collection('settlements').doc(settlementId),
};

// ─── Phone Auth Helpers ─────────────────────────────────────────────────────

/** Send OTP to phone number. Returns confirmation object to verify OTP. */
export async function sendOTP(phoneNumber: string) {
  // Ensure phone number has country code
  const formatted = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;
  const confirmation = await auth().signInWithPhoneNumber(formatted);
  return confirmation;
}

/** Verify OTP code against the confirmation object from sendOTP */
export async function verifyOTP(
  confirmation: any,  // FirebaseAuthTypes.ConfirmationResult
  code: string,
) {
  const result = await confirmation.confirm(code);
  return result;
}

/** Sign out current user */
export async function signOut() {
  await auth().signOut();
}

/** Get current Firebase user */
export function getCurrentUser() {
  return auth().currentUser;
}

/** Listen to auth state changes */
export function onAuthStateChanged(callback: (user: any) => void) {
  return auth().onAuthStateChanged(callback);
}
