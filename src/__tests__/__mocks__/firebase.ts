const mockDoc = {
  exists: true,
  data: () => ({}),
  id: 'mock-id',
};

interface MockCollection {
  doc: jest.Mock;
  add: jest.Mock;
  get: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  onSnapshot: jest.Mock;
}

const mockCollection: MockCollection = {
  doc: jest.fn(() => ({
    get: jest.fn(async () => mockDoc),
    set: jest.fn(async () => {}),
    update: jest.fn(async () => {}),
    delete: jest.fn(async () => {}),
    onSnapshot: jest.fn(() => () => {}),
  })),
  add: jest.fn(async () => ({ id: 'new-id' })),
  get: jest.fn(async () => ({ docs: [], empty: true })),
  where: jest.fn((): MockCollection => mockCollection),
  orderBy: jest.fn((): MockCollection => mockCollection),
  onSnapshot: jest.fn(() => () => {}),
};

const firestore = jest.fn(() => ({
  collection: jest.fn(() => mockCollection),
})) as jest.Mock & { FieldValue: { serverTimestamp: jest.Mock } };
firestore.FieldValue = { serverTimestamp: jest.fn(() => 'timestamp') };

const auth = jest.fn(() => ({
  signInWithPhoneNumber: jest.fn(),
  signOut: jest.fn(async () => {}),
  currentUser: null,
  onAuthStateChanged: jest.fn(() => () => {}),
}));

export default () => ({});
export { firestore, auth };
