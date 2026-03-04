import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import storage from '@react-native-firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Transaction,
  Group,
  GroupTransaction,
  Split,
  TrackerType,
  ParsedTransaction,
  User,
} from '../models/types';
import { buildDescription } from './TransactionParser';

// ─────────────────────────────────────────────────────────────────────────────
// DEV MOCK FLAGS — set all to false when real Firebase + Storage are connected
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DEV_MOCK_FIREBASE = true → replaces all Firestore + Auth calls with
 *   AsyncStorage-backed in-memory data. No Firebase project needed.
 *   Export is used by AuthContext to bypass the Firebase auth listener.
 */
export const DEV_MOCK_FIREBASE = true;
export const MOCK_USER_ID = 'dev-user-001';

const MOCK_USER: User = {
  id: MOCK_USER_ID,
  displayName: 'Dev User',
  phone: '+919900000000',
  createdAt: 1700000000000,
};

/**
 * DEV_MOCK_OTP = true  → any 6-digit code works, uses signInAnonymously under the hood.
 *                         Set to false once Firebase Phone Auth is configured.
 */
const DEV_MOCK_OTP = true;

/**
 * DEV_MOCK_STORAGE = true → stores local file:// URI directly in Firestore/mock store.
 *                           Set to false once Firebase Storage is enabled.
 */
const DEV_MOCK_STORAGE = true;

// ─────────────────────────────────────────────────────────────────────────────
// Mock data store (in-memory, persisted to AsyncStorage)
// ─────────────────────────────────────────────────────────────────────────────

const KEYS = {
  txns: '@mock_txns',
  groups: '@mock_groups',
  users: '@mock_users',
  groupTxnPrefix: '@mock_gtxns_',
};

const _store: {
  txns: Transaction[];
  groups: Group[];
  groupTxns: Record<string, GroupTransaction[]>;
  users: Record<string, User>;
  loaded: boolean;
} = { txns: [], groups: [], groupTxns: {}, users: {}, loaded: false };

// Subscriber sets
const _txnSubs = new Set<{
  trackerType: TrackerType;
  groupId?: string;
  cb: (t: Transaction[]) => void;
}>();
const _groupSubs = new Set<(g: Group[]) => void>();
const _groupTxnSubs = new Map<string, Set<(t: GroupTransaction[]) => void>>();

async function _load() {
  if (_store.loaded) return;
  try {
    const [t, g, u] = await AsyncStorage.multiGet([KEYS.txns, KEYS.groups, KEYS.users]);
    if (t[1]) _store.txns = JSON.parse(t[1]);
    if (g[1]) _store.groups = JSON.parse(g[1]);
    if (u[1]) _store.users = JSON.parse(u[1]);
    if (!_store.users[MOCK_USER_ID]) _store.users[MOCK_USER_ID] = MOCK_USER;
    for (const group of _store.groups) {
      const raw = await AsyncStorage.getItem(KEYS.groupTxnPrefix + group.id);
      if (raw) _store.groupTxns[group.id] = JSON.parse(raw);
    }
  } catch { /* start fresh if AsyncStorage is empty */ }
  _store.loaded = true;
}

function _filterTxns(trackerType: TrackerType, groupId?: string): Transaction[] {
  return _store.txns
    .filter(t =>
      t.userId === MOCK_USER_ID &&
      t.trackerType === trackerType &&
      (groupId !== undefined ? t.groupId === groupId : true),
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);
}

function _notifyTxn(trackerType: TrackerType, groupId?: string) {
  _txnSubs.forEach(({ trackerType: tt, groupId: gid, cb }) => {
    if (tt === trackerType && gid === groupId) cb(_filterTxns(tt, gid));
  });
}

function _notifyGroups() {
  const sorted = [..._store.groups].sort((a, b) => b.createdAt - a.createdAt);
  _groupSubs.forEach(cb => cb(sorted));
}

function _notifyGroupTxn(groupId: string) {
  const subs = _groupTxnSubs.get(groupId);
  if (!subs) return;
  const sorted = (_store.groupTxns[groupId] ?? []).sort((a, b) => b.timestamp - a.timestamp);
  subs.forEach(cb => cb(sorted));
}

function _uid(): string {
  return `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function getCurrentUserId(): string | null {
  if (DEV_MOCK_FIREBASE) return MOCK_USER_ID;
  return auth().currentUser?.uid || null;
}

export async function signInAnonymously(): Promise<string> {
  if (DEV_MOCK_FIREBASE) return MOCK_USER_ID;
  const result = await auth().signInAnonymously();
  return result.user.uid;
}

interface MockConfirmation { _isMock: true; phone: string; }

export async function sendOtp(phoneNumber: string): Promise<any> {
  if (DEV_MOCK_OTP || DEV_MOCK_FIREBASE) {
    await new Promise(r => setTimeout(r, 800));
    return { _isMock: true, phone: phoneNumber } as MockConfirmation;
  }
  return auth().signInWithPhoneNumber(phoneNumber);
}

export async function verifyOtp(confirmation: any, code: string): Promise<string> {
  if (DEV_MOCK_FIREBASE) {
    if (code.length !== 6) throw new Error('Enter all 6 digits');
    await new Promise(r => setTimeout(r, 500));
    return MOCK_USER_ID;
  }
  if ((confirmation as MockConfirmation)._isMock) {
    if (code.length !== 6) throw new Error('Enter all 6 digits');
    const result = await auth().signInAnonymously();
    return result.user.uid;
  }
  const result = await confirmation.confirm(code);
  if (!result?.user) throw new Error('OTP verification failed');
  return result.user.uid;
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getUserByPhone(phone: string): Promise<User | null> {
  if (DEV_MOCK_FIREBASE) {
    await _load();
    return Object.values(_store.users).find(u => u.phone === phone) ?? null;
  }
  const snapshot = await firestore()
    .collection('users')
    .where('phone', '==', phone)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as User;
}

export async function updateUserProfile(userId: string, data: Partial<User>): Promise<void> {
  if (DEV_MOCK_FIREBASE) {
    await _load();
    _store.users[userId] = { ...(_store.users[userId] ?? {}), ...data } as User;
    await AsyncStorage.setItem(KEYS.users, JSON.stringify(_store.users));
    return;
  }
  await firestore().collection('users').doc(userId).set(data, { merge: true });
}

export async function getUserProfile(userId: string): Promise<User | null> {
  if (DEV_MOCK_FIREBASE) {
    await _load();
    return _store.users[userId] ?? null;
  }
  const doc = await firestore().collection('users').doc(userId).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as User) : null;
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function saveTransaction(
  parsed: ParsedTransaction,
  trackerType: TrackerType,
  groupId?: string,
  source: Transaction['source'] = 'sms',
): Promise<string> {
  if (DEV_MOCK_FIREBASE) {
    await _load();
    const id = _uid();
    const txn: Transaction = {
      id,
      userId: MOCK_USER_ID,
      amount: parsed.amount,
      description: buildDescription(parsed),
      merchant: parsed.merchant,
      source,
      rawMessage: parsed.rawMessage,
      trackerType,
      groupId,
      timestamp: parsed.timestamp,
      createdAt: Date.now(),
    };
    _store.txns.push(txn);
    await AsyncStorage.setItem(KEYS.txns, JSON.stringify(_store.txns));
    _notifyTxn(trackerType, groupId);
    return id;
  }

  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');
  const transaction: Omit<Transaction, 'id'> = {
    userId,
    amount: parsed.amount,
    description: buildDescription(parsed),
    merchant: parsed.merchant,
    source,
    rawMessage: parsed.rawMessage,
    trackerType,
    groupId,
    timestamp: parsed.timestamp,
    createdAt: Date.now(),
  };
  const ref = await firestore().collection('transactions').add(transaction);
  return ref.id;
}

export function subscribeToTransactions(
  trackerType: TrackerType,
  groupId: string | undefined,
  callback: (transactions: Transaction[]) => void,
): () => void {
  if (DEV_MOCK_FIREBASE) {
    const entry = { trackerType, groupId, cb: callback };
    _txnSubs.add(entry);
    // Send current data immediately (async load then call)
    _load().then(() => callback(_filterTxns(trackerType, groupId)));
    return () => _txnSubs.delete(entry);
  }

  const userId = getCurrentUserId();
  if (!userId) return () => {};
  let query = firestore()
    .collection('transactions')
    .where('userId', '==', userId)
    .where('trackerType', '==', trackerType)
    .orderBy('timestamp', 'desc')
    .limit(100);
  if (groupId) query = query.where('groupId', '==', groupId);
  return query.onSnapshot(snapshot => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Transaction[]);
  });
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  if (DEV_MOCK_FIREBASE) {
    await _load();
    const txn = _store.txns.find(t => t.id === transactionId);
    _store.txns = _store.txns.filter(t => t.id !== transactionId);
    await AsyncStorage.setItem(KEYS.txns, JSON.stringify(_store.txns));
    if (txn) _notifyTxn(txn.trackerType, txn.groupId);
    return;
  }
  await firestore().collection('transactions').doc(transactionId).delete();
}

// ── Bill images ───────────────────────────────────────────────────────────────

export async function uploadBillImage(
  transactionId: string,
  imageUri: string,
): Promise<string> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  if (DEV_MOCK_FIREBASE || DEV_MOCK_STORAGE) {
    await _load();
    const txn = _store.txns.find(t => t.id === transactionId);
    if (txn) {
      txn.billImageUrl = imageUri;
      await AsyncStorage.setItem(KEYS.txns, JSON.stringify(_store.txns));
      _notifyTxn(txn.trackerType, txn.groupId);
    }
    return imageUri;
  }

  const ref = storage().ref(`bills/${userId}/${transactionId}.jpg`);
  await ref.putFile(imageUri);
  const downloadUrl = await ref.getDownloadURL();
  await firestore().collection('transactions').doc(transactionId).update({ billImageUrl: downloadUrl });
  return downloadUrl;
}

export async function deleteBillImage(transactionId: string): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  if (DEV_MOCK_FIREBASE || DEV_MOCK_STORAGE) {
    await _load();
    const txn = _store.txns.find(t => t.id === transactionId);
    if (txn) {
      delete txn.billImageUrl;
      await AsyncStorage.setItem(KEYS.txns, JSON.stringify(_store.txns));
      _notifyTxn(txn.trackerType, txn.groupId);
    }
    return;
  }

  try { await storage().ref(`bills/${userId}/${transactionId}.jpg`).delete(); } catch { }
  await firestore().collection('transactions').doc(transactionId).update({ billImageUrl: null });
}

// ── Groups ────────────────────────────────────────────────────────────────────

export async function createGroup(
  name: string,
  members: { displayName: string; phone: string }[],
): Promise<string> {
  if (DEV_MOCK_FIREBASE) {
    await _load();
    const id = _uid();
    const group: Group = {
      id,
      name,
      members: [
        { userId: MOCK_USER_ID, displayName: 'Dev User', phone: '+919900000000' },
        ...members.map(m => ({ userId: '', displayName: m.displayName, phone: m.phone })),
      ],
      createdBy: MOCK_USER_ID,
      createdAt: Date.now(),
    };
    _store.groups.push(group);
    _store.groupTxns[id] = [];
    await AsyncStorage.setItem(KEYS.groups, JSON.stringify(_store.groups));
    _notifyGroups();
    return id;
  }

  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');
  const userProfile = await getUserProfile(userId);
  const resolvedMembers = await Promise.all(
    members.map(async m => {
      if (m.phone) {
        const found = await getUserByPhone(m.phone);
        if (found) return { userId: found.id, displayName: found.displayName, phone: m.phone };
      }
      return { userId: '', displayName: m.displayName, phone: m.phone };
    }),
  );
  const allMembers = [
    { userId, displayName: userProfile?.displayName || 'You', phone: userProfile?.phone || '' },
    ...resolvedMembers,
  ];
  const memberUserIds = allMembers.map(m => m.userId).filter(Boolean);
  const ref = await firestore().collection('groups').add({
    name, members: allMembers, memberUserIds, createdBy: userId, createdAt: Date.now(),
  });
  return ref.id;
}

export function subscribeToGroups(callback: (groups: Group[]) => void): () => void {
  if (DEV_MOCK_FIREBASE) {
    _groupSubs.add(callback);
    _load().then(() => {
      callback([..._store.groups].sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => _groupSubs.delete(callback);
  }

  const userId = getCurrentUserId();
  if (!userId) return () => {};
  let createdGroups: Group[] = [];
  let memberGroups: Group[] = [];
  const merge = () => {
    const seen = new Set<string>();
    const all: Group[] = [];
    for (const g of [...createdGroups, ...memberGroups]) {
      if (!seen.has(g.id)) { seen.add(g.id); all.push(g); }
    }
    all.sort((a, b) => b.createdAt - a.createdAt);
    callback(all);
  };
  const unsub1 = firestore().collection('groups').where('createdBy', '==', userId)
    .orderBy('createdAt', 'desc').onSnapshot(snap => {
      createdGroups = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Group[];
      merge();
    });
  const unsub2 = firestore().collection('groups').where('memberUserIds', 'array-contains', userId)
    .orderBy('createdAt', 'desc').onSnapshot(snap => {
      memberGroups = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Group[];
      merge();
    });
  return () => { unsub1(); unsub2(); };
}

export async function getGroup(groupId: string): Promise<Group | null> {
  if (DEV_MOCK_FIREBASE) {
    await _load();
    return _store.groups.find(g => g.id === groupId) ?? null;
  }
  const doc = await firestore().collection('groups').doc(groupId).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as Group) : null;
}

// ── Group Transactions ────────────────────────────────────────────────────────

export async function addGroupTransaction(
  parsed: ParsedTransaction,
  groupId: string,
): Promise<string> {
  if (DEV_MOCK_FIREBASE) {
    await _load();
    const group = _store.groups.find(g => g.id === groupId);
    if (!group) throw new Error('Group not found');
    const splitAmount = Math.round((parsed.amount / group.members.length) * 100) / 100;
    const splits: Split[] = group.members.map(m => ({
      userId: m.userId,
      displayName: m.displayName,
      amount: splitAmount,
      settled: m.userId === MOCK_USER_ID,
    }));
    const id = _uid();
    const gtxn: GroupTransaction = {
      id, groupId, addedBy: MOCK_USER_ID,
      amount: parsed.amount, description: buildDescription(parsed),
      merchant: parsed.merchant, timestamp: parsed.timestamp, splits,
    };
    if (!_store.groupTxns[groupId]) _store.groupTxns[groupId] = [];
    _store.groupTxns[groupId].push(gtxn);
    await AsyncStorage.setItem(KEYS.groupTxnPrefix + groupId, JSON.stringify(_store.groupTxns[groupId]));
    _notifyGroupTxn(groupId);
    // Also save to personal transactions
    await saveTransaction(parsed, 'group', groupId);
    return id;
  }

  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');
  const group = await getGroup(groupId);
  if (!group) throw new Error('Group not found');
  const splitAmount = Math.round((parsed.amount / group.members.length) * 100) / 100;
  const splits: Split[] = group.members.map(member => ({
    userId: member.userId, displayName: member.displayName,
    amount: splitAmount, settled: member.userId === userId,
  }));
  const ref = await firestore().collection('groups').doc(groupId).collection('transactions').add({
    groupId, addedBy: userId, amount: parsed.amount,
    description: buildDescription(parsed), merchant: parsed.merchant,
    timestamp: parsed.timestamp, splits,
  });
  await saveTransaction(parsed, 'group', groupId);
  return ref.id;
}

export function subscribeToGroupTransactions(
  groupId: string,
  callback: (transactions: GroupTransaction[]) => void,
): () => void {
  if (DEV_MOCK_FIREBASE) {
    if (!_groupTxnSubs.has(groupId)) _groupTxnSubs.set(groupId, new Set());
    _groupTxnSubs.get(groupId)!.add(callback);
    _load().then(() => {
      const sorted = (_store.groupTxns[groupId] ?? []).sort((a, b) => b.timestamp - a.timestamp);
      callback(sorted);
    });
    return () => _groupTxnSubs.get(groupId)?.delete(callback);
  }

  return firestore().collection('groups').doc(groupId).collection('transactions')
    .orderBy('timestamp', 'desc').limit(100)
    .onSnapshot(snap => {
      callback(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as GroupTransaction[]);
    });
}

export async function settleDebt(
  groupId: string,
  fromUserId: string,
  toUserId: string,
  _paidAmount: number,
): Promise<void> {
  if (DEV_MOCK_FIREBASE) {
    await _load();
    const txns = _store.groupTxns[groupId] ?? [];
    let changed = false;
    for (const txn of txns) {
      if (txn.addedBy !== toUserId) continue;
      for (const split of txn.splits) {
        if (split.userId === fromUserId && !split.settled) {
          split.settled = true;
          changed = true;
        }
      }
    }
    if (changed) {
      await AsyncStorage.setItem(KEYS.groupTxnPrefix + groupId, JSON.stringify(txns));
      _notifyGroupTxn(groupId);
    }
    return;
  }

  const snapshot = await firestore().collection('groups').doc(groupId)
    .collection('transactions').where('addedBy', '==', toUserId).get();
  const batch = firestore().batch();
  snapshot.docs.forEach(doc => {
    const txn = doc.data() as GroupTransaction;
    if (!txn.splits.some(s => s.userId === fromUserId && !s.settled)) return;
    batch.update(doc.ref, {
      splits: txn.splits.map(s => s.userId === fromUserId ? { ...s, settled: true } : s),
    });
  });
  await batch.commit();
}

export async function settleSplit(
  groupId: string,
  transactionId: string,
  userId: string,
): Promise<void> {
  if (DEV_MOCK_FIREBASE) {
    await _load();
    const txns = _store.groupTxns[groupId] ?? [];
    const txn = txns.find(t => t.id === transactionId);
    if (!txn) return;
    for (const split of txn.splits) {
      if (split.userId === userId) split.settled = true;
    }
    await AsyncStorage.setItem(KEYS.groupTxnPrefix + groupId, JSON.stringify(txns));
    _notifyGroupTxn(groupId);
    return;
  }

  const ref = firestore().collection('groups').doc(groupId).collection('transactions').doc(transactionId);
  const doc = await ref.get();
  if (!doc.exists) return;
  const txn = doc.data() as GroupTransaction;
  await ref.update({ splits: txn.splits.map(s => s.userId === userId ? { ...s, settled: true } : s) });
}
