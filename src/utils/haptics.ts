import { Platform, Vibration } from 'react-native';

/**
 * Cross-platform haptic feedback.
 * iOS: uses expo-haptics for native taptic engine feel (if installed).
 * Android: uses Vibration API (which works well on Android).
 * Falls back to Vibration on both platforms if expo-haptics is not available.
 */

let Haptics: any = null;
try {
  Haptics = require('expo-haptics');
} catch {
  // expo-haptics not installed, will use Vibration fallback
}

/** Light tap — selection change, toggle, category pick */
export function hapticLight() {
  if (Platform.OS === 'ios' && Haptics) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } else {
    Vibration.vibrate(20);
  }
}

/** Medium tap — button press, FAB tap, confirm action */
export function hapticMedium() {
  if (Platform.OS === 'ios' && Haptics) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } else {
    Vibration.vibrate(40);
  }
}

/** Heavy tap — delete, important action */
export function hapticHeavy() {
  if (Platform.OS === 'ios' && Haptics) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } else {
    Vibration.vibrate(50);
  }
}

/** Selection feedback — scrolling through options */
export function hapticSelection() {
  if (Platform.OS === 'ios' && Haptics) {
    Haptics.selectionAsync();
  } else {
    Vibration.vibrate(20);
  }
}

/** Success notification */
export function hapticSuccess() {
  if (Platform.OS === 'ios' && Haptics) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } else {
    Vibration.vibrate(50);
  }
}

/** Dev mode / long press */
export function hapticDevMode() {
  if (Platform.OS === 'ios' && Haptics) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } else {
    Vibration.vibrate(100);
  }
}
