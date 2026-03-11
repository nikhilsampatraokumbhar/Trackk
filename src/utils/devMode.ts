import AsyncStorage from '@react-native-async-storage/async-storage';

const DEV_MODE_KEY = '@et_dev_mode';

let devModeEnabled = false;

export async function loadDevMode(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(DEV_MODE_KEY);
    devModeEnabled = val === 'true';
    return devModeEnabled;
  } catch {
    return false;
  }
}

export function isDevMode(): boolean {
  return devModeEnabled;
}

export async function setDevMode(enabled: boolean): Promise<void> {
  devModeEnabled = enabled;
  await AsyncStorage.setItem(DEV_MODE_KEY, enabled ? 'true' : 'false');
}
