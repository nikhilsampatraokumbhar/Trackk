import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Share } from 'react-native';

const BACKUP_VERSION = 1;

/**
 * Export all local data (personal expenses, goals, settings) as a JSON file and share.
 */
export async function backupAllData(): Promise<void> {
  // Get all AsyncStorage keys
  const allKeys: string[] = [];
  let currentKeys = await AsyncStorage.getAllKeys();
  // getAllKeys returns readonly string[], so convert
  for (const k of currentKeys) allKeys.push(k);

  // Collect all key-value pairs
  const data: Record<string, string | null> = {};
  for (const key of allKeys) {
    // Skip sensitive/auth keys
    if (key.startsWith('@et_auth') || key.startsWith('@et_token')) continue;
    const value = await AsyncStorage.getItem(key);
    data[key] = value;
  }

  const backup = {
    version: BACKUP_VERSION,
    app: 'trackk',
    createdAt: new Date().toISOString(),
    keyCount: Object.keys(data).length,
    data,
  };

  const json = JSON.stringify(backup, null, 2);
  const filename = `trackk_backup_${new Date().toISOString().slice(0, 10)}.json`;
  const filePath = `${FileSystem.cacheDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(filePath, json, { encoding: FileSystem.EncodingType.UTF8 });

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/json',
      dialogTitle: 'Save Trackk Backup',
      UTI: 'public.json',
    });
  } else {
    await Share.share({ message: json, title: filename });
  }
}

/**
 * Pick a backup JSON file and restore all data from it.
 * Returns true if restored successfully.
 */
export async function restoreFromBackup(): Promise<boolean> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) {
    return false;
  }

  const asset = result.assets[0];
  const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });

  let backup: any;
  try {
    backup = JSON.parse(content);
  } catch {
    throw new Error('Invalid backup file. Could not parse JSON.');
  }

  if (backup.app !== 'trackk' || !backup.data) {
    throw new Error('This does not appear to be a valid Trackk backup file.');
  }

  // Restore all key-value pairs
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(backup.data)) {
    if (typeof value === 'string') {
      pairs.push([key, value]);
    }
  }

  if (pairs.length === 0) {
    throw new Error('Backup file contains no data.');
  }

  for (const [key, value] of pairs) {
    await AsyncStorage.setItem(key, value);
  }

  return true;
}
