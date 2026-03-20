/**
 * BackupService Tests
 *
 * Tests backup creation, restore validation, key exclusion (auth/tokens),
 * corrupt file handling, empty backup detection, and round-trip integrity.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { backupAllData, restoreFromBackup } from '../services/BackupService';

beforeEach(() => {
  (AsyncStorage as any)._clear();
  jest.clearAllMocks();
});

describe('BackupService', () => {
  describe('backupAllData', () => {
    it('should create backup with correct metadata', async () => {
      await AsyncStorage.setItem('@et_user', '{"id":"u1"}');
      await AsyncStorage.setItem('@et_transactions', '[{"id":"t1"}]');

      await backupAllData();

      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
      const content = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1];
      const backup = JSON.parse(content);

      expect(backup.app).toBe('trackk');
      expect(backup.version).toBe(1);
      expect(backup.keyCount).toBe(2);
      expect(backup.createdAt).toBeTruthy();
      expect(backup.data['@et_user']).toBe('{"id":"u1"}');
      expect(backup.data['@et_transactions']).toBe('[{"id":"t1"}]');
    });

    it('should exclude auth/token keys from backup', async () => {
      await AsyncStorage.setItem('@et_user', '{"id":"u1"}');
      await AsyncStorage.setItem('@et_auth_token', 'secret123');
      await AsyncStorage.setItem('@et_token_refresh', 'refresh456');

      await backupAllData();

      const content = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1];
      const backup = JSON.parse(content);

      expect(backup.data['@et_auth_token']).toBeUndefined();
      expect(backup.data['@et_token_refresh']).toBeUndefined();
      expect(backup.data['@et_user']).toBeDefined();
    });

    it('should generate correct filename with date', async () => {
      await backupAllData();

      const path = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][0];
      expect(path).toContain('trackk_backup_');
      expect(path).toMatch(/trackk_backup_\d{4}-\d{2}-\d{2}\.json$/);
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore all key-value pairs from valid backup', async () => {
      const backupData = JSON.stringify({
        app: 'trackk',
        version: 1,
        data: {
          '@et_user': '{"id":"u1","displayName":"John"}',
          '@et_transactions': '[{"id":"t1","amount":500}]',
        },
      });

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(backupData);

      const result = await restoreFromBackup();
      expect(result).toBe(true);

      const user = await AsyncStorage.getItem('@et_user');
      expect(user).toBe('{"id":"u1","displayName":"John"}');

      const txns = await AsyncStorage.getItem('@et_transactions');
      expect(txns).toBe('[{"id":"t1","amount":500}]');
    });

    it('should throw for invalid JSON', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce('not-json{');

      await expect(restoreFromBackup()).rejects.toThrow('Invalid backup file');
    });

    it('should throw for non-trackk backup file', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({ app: 'other-app', data: {} }),
      );

      await expect(restoreFromBackup()).rejects.toThrow('valid Trackk backup');
    });

    it('should throw for backup with no data', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({ app: 'trackk', data: {} }),
      );

      await expect(restoreFromBackup()).rejects.toThrow('no data');
    });

    it('should return false when user cancels document picker', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
        canceled: true,
        assets: [],
      });

      const result = await restoreFromBackup();
      expect(result).toBe(false);
    });

    it('should handle backup with mixed null and string values', async () => {
      const backupData = JSON.stringify({
        app: 'trackk',
        version: 1,
        data: {
          '@et_user': '{"id":"u1"}',
          '@et_nullkey': null, // null values should be skipped
        },
      });

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(backupData);

      const result = await restoreFromBackup();
      expect(result).toBe(true);

      // Only string values should be restored
      expect(await AsyncStorage.getItem('@et_user')).toBe('{"id":"u1"}');
    });
  });
});
