export const PERMISSIONS = {
  ANDROID: { READ_SMS: 'READ_SMS', RECEIVE_SMS: 'RECEIVE_SMS' },
  IOS: {},
};
export const RESULTS = { GRANTED: 'granted', DENIED: 'denied', BLOCKED: 'blocked' };
export const check = jest.fn(async () => RESULTS.GRANTED);
export const request = jest.fn(async () => RESULTS.GRANTED);
export const requestMultiple = jest.fn(async () => ({
  READ_SMS: RESULTS.GRANTED,
  RECEIVE_SMS: RESULTS.GRANTED,
}));
