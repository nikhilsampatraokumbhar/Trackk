export const Platform = { OS: 'android', select: (obj: any) => obj.android };
export const Alert = { alert: jest.fn() };
export const Linking = {
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn(async () => null),
};
export const NativeModules = {
  SmsAndroid: { list: jest.fn() },
};
export const NativeEventEmitter = jest.fn(() => ({
  addListener: jest.fn(() => ({ remove: jest.fn() })),
}));
export const Share = { share: jest.fn() };
export const PermissionsAndroid = {
  PERMISSIONS: { READ_SMS: 'READ_SMS', RECEIVE_SMS: 'RECEIVE_SMS' },
  RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
  requestMultiple: jest.fn(async () => ({
    READ_SMS: 'granted',
    RECEIVE_SMS: 'granted',
  })),
  check: jest.fn(async () => true),
};
export const DeviceEventEmitter = {
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};
export const AppState = {
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  currentState: 'active',
};
export const View = 'View';
export const Text = 'Text';
export const TouchableOpacity = 'TouchableOpacity';
export const StyleSheet = { create: (s: any) => s };
export const ScrollView = 'ScrollView';
export const TextInput = 'TextInput';
export const Modal = 'Modal';
export const KeyboardAvoidingView = 'KeyboardAvoidingView';
export const RefreshControl = 'RefreshControl';
export default {
  Platform, Alert, Linking, NativeModules, NativeEventEmitter,
  Share, PermissionsAndroid, DeviceEventEmitter, AppState,
};
