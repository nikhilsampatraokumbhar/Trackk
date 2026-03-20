const notifee = {
  createChannel: jest.fn(async () => 'channel-id'),
  displayNotification: jest.fn(async () => 'notif-id'),
  cancelNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
  getInitialNotification: jest.fn(async () => null),
  onForegroundEvent: jest.fn(() => () => {}),
  onBackgroundEvent: jest.fn(() => {}),
  EventType: { PRESS: 1, ACTION_PRESS: 2, DISMISSED: 3 },
  AndroidImportance: { HIGH: 4, LOW: 2 },
  AndroidStyle: { BIGTEXT: 1 },
  AndroidCategory: { MESSAGE: 'msg' },
};
export default notifee;
export const EventType = notifee.EventType;
export const AndroidImportance = notifee.AndroidImportance;
export const AndroidCategory = notifee.AndroidCategory;
