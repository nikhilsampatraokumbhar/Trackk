/**
 * FCM Device Token Registration
 *
 * Registers the device's FCM token in Firestore so Cloud Functions
 * can send push notifications for email-detected transactions.
 * Works on both Android and iOS.
 */

import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { db } from './FirebaseConfig';

let currentToken: string | null = null;

/**
 * Request notification permission (required on iOS, auto-granted on Android < 13).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const authStatus = await messaging().requestPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
}

/**
 * Get the current FCM token and register it in Firestore.
 * Should be called after user signs in.
 */
export async function registerDeviceToken(uid: string): Promise<void> {
  try {
    // Get APNs token first on iOS (required before FCM token)
    if (Platform.OS === 'ios') {
      await messaging().registerDeviceForRemoteMessages();
    }

    const token = await messaging().getToken();
    if (!token) return;

    currentToken = token;

    // Store in Firestore under user's devices subcollection
    await db.user(uid).collection('devices').doc(token).set({
      fcmToken: token,
      platform: Platform.OS,
      lastSeen: Date.now(),
      createdAt: Date.now(),
    }, { merge: true });
  } catch (error) {
    // FCM may not be available in emulator — fail silently
    console.log('FCM token registration failed:', error);
  }
}

/**
 * Listen for token refreshes and update Firestore.
 * Returns an unsubscribe function.
 */
export function onTokenRefresh(uid: string): () => void {
  return messaging().onTokenRefresh(async (newToken) => {
    // Remove old token
    if (currentToken && currentToken !== newToken) {
      try {
        await db.user(uid).collection('devices').doc(currentToken).delete();
      } catch (_) {
        // Ignore — old token doc may not exist
      }
    }

    currentToken = newToken;

    await db.user(uid).collection('devices').doc(newToken).set({
      fcmToken: newToken,
      platform: Platform.OS,
      lastSeen: Date.now(),
      createdAt: Date.now(),
    }, { merge: true });
  });
}

/**
 * Remove the current device's FCM token from Firestore.
 * Should be called on sign out.
 */
export async function unregisterDeviceToken(uid: string): Promise<void> {
  if (!currentToken) return;

  try {
    await db.user(uid).collection('devices').doc(currentToken).delete();
    currentToken = null;
  } catch (_) {
    // Ignore cleanup errors
  }
}

/**
 * Set up FCM message handlers for background/foreground notifications.
 * Returns an unsubscribe function for the foreground handler.
 */
export function setupFcmHandlers(
  onTransaction: (data: Record<string, string>) => void
): () => void {
  // Foreground messages
  const unsubscribe = messaging().onMessage(async (remoteMessage) => {
    if (remoteMessage.data?.type === 'email_transaction') {
      onTransaction(remoteMessage.data as Record<string, string>);
    }
  });

  // Background messages — handled in index.js
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    // The notification is already displayed by the system
    // The app handles the tap action via notification press
    if (remoteMessage.data?.type === 'email_transaction') {
      // Data is passed via notification — handled when user taps
    }
  });

  return unsubscribe;
}
