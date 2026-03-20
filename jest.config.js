module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowJs: true,
        moduleResolution: 'node',
        strict: true,
      },
    }],
  },
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/__tests__/__mocks__/async-storage.ts',
    '^react-native$': '<rootDir>/src/__tests__/__mocks__/react-native.ts',
    '^@notifee/react-native$': '<rootDir>/src/__tests__/__mocks__/notifee.ts',
    '^@react-native-firebase/(.*)$': '<rootDir>/src/__tests__/__mocks__/firebase.ts',
    '^react-native-get-sms-android$': '<rootDir>/src/__tests__/__mocks__/sms-android.ts',
    '^react-native-permissions$': '<rootDir>/src/__tests__/__mocks__/permissions.ts',
    '^expo-linear-gradient$': '<rootDir>/src/__tests__/__mocks__/expo.ts',
    '^expo-file-system/legacy$': '<rootDir>/src/__tests__/__mocks__/expo-file-system.ts',
    '^expo-file-system$': '<rootDir>/src/__tests__/__mocks__/expo-file-system.ts',
    '^expo-sharing$': '<rootDir>/src/__tests__/__mocks__/expo-sharing.ts',
    '^expo-print$': '<rootDir>/src/__tests__/__mocks__/expo-print.ts',
    '^expo-document-picker$': '<rootDir>/src/__tests__/__mocks__/expo-document-picker.ts',
  },
};
