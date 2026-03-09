const mockDoc = {
  exists: true,
  data: () => ({}),
  id: 'mock-id',
};

const mockCollection = {
  doc: jest.fn(() => ({
    get: jest.fn(async () => mockDoc),
    set: jest.fn(async () => {}),
    update: jest.fn(async () => {}),
    delete: jest.fn(async () => {}),
    onSnapshot: jest.fn(() => () => {}),
  })),
  add: jest.fn(async () => ({ id: 'new-id' })),
  get: jest.fn(async () => ({ docs: [], empty: true })),
  where: jest.fn(() => mockCollection),
  orderBy: jest.fn(() => mockCollection),
  onSnapshot: jest.fn(() => () => {}),
};

const firestore = jest.fn(() => ({
  collection: jest.fn(() => mockCollection),
}));
firestore.FieldValue = { serverTimestamp: jest.fn(() => 'timestamp') };

const auth = jest.fn(() => ({
  signInWithPhoneNumber: jest.fn(),
  signOut: jest.fn(async () => {}),
  currentUser: null,
  onAuthStateChanged: jest.fn(() => () => {}),
}));

export default () => ({});
export { firestore, auth };
