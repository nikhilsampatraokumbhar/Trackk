// ─── Firestore Sync Service ─────────────────────────────────────────────────
// Handles all cloud sync for group data: groups, transactions, settlements.
// Personal data (personal expenses, goals, daily spends) stays local.
// Group data syncs via Firestore so all members see real-time updates.
// ─────────────────────────────────────────────────────────────────────────────

import { db, firestore } from './FirebaseConfig';
import {
  Group, GroupTransaction, Settlement, GroupMember, Split,
} from '../models/types';
import { generateId } from '../utils/helpers';
import { buildDescription } from './TransactionParser';
import type { ParsedTransaction } from '../models/types';

// ─── User Profile Sync ──────────────────────────────────────────────────────

export interface FirebaseUserProfile {
  uid: string;
  phone: string;
  displayName: string;
  createdAt: number;
}

/** Create or update user profile in Firestore */
export async function syncUserProfile(uid: string, phone: string, displayName: string) {
  await db.user(uid).set({
    uid,
    phone,
    displayName,
    updatedAt: Date.now(),
  }, { merge: true });
}

/** Look up a user by phone number - used to match group members to real accounts */
export async function findUserByPhone(phone: string): Promise<FirebaseUserProfile | null> {
  const normalized = phone.replace(/\D/g, '').slice(-10); // last 10 digits
  const snapshot = await db.users()
    .where('phone', '>=', normalized)
    .where('phone', '<=', normalized + '\uf8ff')
    .limit(5)
    .get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const docPhone = (data.phone || '').replace(/\D/g, '').slice(-10);
    if (docPhone === normalized) {
      return data as FirebaseUserProfile;
    }
  }
  return null;
}

// ─── Group Sync ─────────────────────────────────────────────────────────────

/** Create a group in Firestore */
export async function createGroupCloud(
  name: string,
  members: Array<{ displayName: string; phone: string }>,
  creatorUid: string,
  creatorPhone: string,
  isTrip?: boolean,
): Promise<Group> {
  const groupId = generateId();

  // Build member list - creator + others
  const groupMembers: GroupMember[] = [
    { userId: creatorUid, displayName: 'You', phone: creatorPhone },
    ...members.map(m => ({
      userId: generateId(), // placeholder until they sign in
      displayName: m.displayName,
      phone: m.phone,
    })),
  ];

  // All member phone numbers for querying
  const memberPhones = groupMembers
    .map(m => m.phone.replace(/\D/g, '').slice(-10))
    .filter(p => p.length === 10);

  // All member UIDs (just creator for now)
  const memberIds = [creatorUid];

  const group: Group = {
    id: groupId,
    name,
    members: groupMembers,
    createdBy: creatorUid,
    createdAt: Date.now(),
    isTrip: isTrip || false,
  };

  // Save to Firestore
  await db.group(groupId).set({
    ...group,
    memberIds,       // for security rules & queries
    memberPhones,    // for matching new users to groups
  });

  return group;
}

/** Get all groups for a user (by UID or phone) */
export async function getGroupsCloud(uid: string, phone: string): Promise<Group[]> {
  const groups: Group[] = [];
  const seen = new Set<string>();

  // Query by memberIds (user is already linked)
  const byUid = await db.groups()
    .where('memberIds', 'array-contains', uid)
    .get();

  byUid.docs.forEach(doc => {
    if (!seen.has(doc.id)) {
      seen.add(doc.id);
      const data = doc.data();
      groups.push({
        id: data.id,
        name: data.name,
        members: data.members,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        isTrip: data.isTrip,
      });
    }
  });

  // Also query by phone (user might be added by phone but hasn't been linked yet)
  const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
  if (normalizedPhone.length === 10) {
    const byPhone = await db.groups()
      .where('memberPhones', 'array-contains', normalizedPhone)
      .get();

    for (const doc of byPhone.docs) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        const data = doc.data();
        groups.push({
          id: data.id,
          name: data.name,
          members: data.members,
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          isTrip: data.isTrip,
        });

        // Link this user's UID to the group so future queries are faster
        await linkUserToGroup(doc.id, uid, normalizedPhone, data.members);
      }
    }
  }

  return groups.sort((a, b) => b.createdAt - a.createdAt);
}

/** Link a user's UID to a group (when they sign in and we match by phone) */
async function linkUserToGroup(
  groupId: string,
  uid: string,
  phone: string,
  members: GroupMember[],
) {
  // Update the member entry to use real UID instead of placeholder
  const updatedMembers = members.map(m => {
    const mPhone = m.phone.replace(/\D/g, '').slice(-10);
    if (mPhone === phone && m.userId !== uid) {
      return { ...m, userId: uid };
    }
    return m;
  });

  await db.group(groupId).update({
    members: updatedMembers,
    memberIds: firestore.FieldValue.arrayUnion(uid),
  });
}

/** Listen to real-time group changes */
export function onGroupChanged(
  groupId: string,
  callback: (group: Group | null) => void,
) {
  return db.group(groupId).onSnapshot(snapshot => {
    if (!snapshot.exists) {
      callback(null);
      return;
    }
    const data = snapshot.data()!;
    callback({
      id: data.id,
      name: data.name,
      members: data.members,
      createdBy: data.createdBy,
      createdAt: data.createdAt,
      isTrip: data.isTrip,
    });
  });
}

// ─── Group Transactions Sync ────────────────────────────────────────────────

/** Add a group transaction to Firestore */
export async function addGroupTransactionCloud(
  parsed: ParsedTransaction,
  groupId: string,
  userId: string,
  members: GroupMember[],
): Promise<GroupTransaction> {
  const splitAmount = Math.round((parsed.amount / members.length) * 100) / 100;

  const splits: Split[] = members.map(member => ({
    userId: member.userId,
    displayName: member.userId === userId ? 'You' : member.displayName,
    amount: splitAmount,
    settled: member.userId === userId, // payer is auto-settled
  }));

  const txn: GroupTransaction = {
    id: generateId(),
    groupId,
    addedBy: userId,
    amount: parsed.amount,
    description: buildDescription(parsed),
    merchant: parsed.merchant,
    timestamp: parsed.timestamp,
    splits,
  };

  await db.groupTransaction(groupId, txn.id).set(txn);
  return txn;
}

/** Get all transactions for a group */
export async function getGroupTransactionsCloud(groupId: string): Promise<GroupTransaction[]> {
  const snapshot = await db.groupTransactions(groupId)
    .orderBy('timestamp', 'desc')
    .get();

  return snapshot.docs.map(doc => doc.data() as GroupTransaction);
}

/** Listen to real-time transaction changes for a group */
export function onGroupTransactionsChanged(
  groupId: string,
  callback: (transactions: GroupTransaction[]) => void,
) {
  return db.groupTransactions(groupId)
    .orderBy('timestamp', 'desc')
    .onSnapshot(snapshot => {
      const txns = snapshot.docs.map(doc => doc.data() as GroupTransaction);
      callback(txns);
    });
}

/** Settle a split in a group transaction (in Firestore) */
export async function settleSplitCloud(
  groupId: string,
  transactionId: string,
  userId: string,
): Promise<void> {
  const docRef = db.groupTransaction(groupId, transactionId);
  const doc = await docRef.get();
  if (!doc.exists) return;

  const txn = doc.data() as GroupTransaction;
  const updatedSplits = txn.splits.map(s =>
    s.userId === userId ? { ...s, settled: true } : s,
  );

  await docRef.update({ splits: updatedSplits });
}

/** Remove a member from a split (in Firestore) */
export async function removeSplitMemberCloud(
  groupId: string,
  transactionId: string,
  memberUserId: string,
): Promise<void> {
  const docRef = db.groupTransaction(groupId, transactionId);
  const doc = await docRef.get();
  if (!doc.exists) return;

  const txn = doc.data() as GroupTransaction;
  const newSplits = txn.splits.filter(s => s.userId !== memberUserId);
  if (newSplits.length === 0) return;

  const perPerson = Math.round((txn.amount / newSplits.length) * 100) / 100;
  const updatedSplits = newSplits.map(s => ({ ...s, amount: perPerson }));

  await docRef.update({ splits: updatedSplits });
}

// ─── Settlements Sync ───────────────────────────────────────────────────────

/** Record a settlement in Firestore */
export async function addSettlementCloud(
  settlement: Omit<Settlement, 'id' | 'timestamp'>,
): Promise<Settlement> {
  const full: Settlement = {
    ...settlement,
    id: generateId(),
    timestamp: Date.now(),
  };

  await db.settlement(settlement.groupId, full.id).set(full);
  return full;
}

/** Get all settlements for a group */
export async function getSettlementsCloud(groupId: string): Promise<Settlement[]> {
  const snapshot = await db.settlements(groupId)
    .orderBy('timestamp', 'desc')
    .get();

  return snapshot.docs.map(doc => doc.data() as Settlement);
}

/** Listen to real-time settlement changes */
export function onSettlementsChanged(
  groupId: string,
  callback: (settlements: Settlement[]) => void,
) {
  return db.settlements(groupId)
    .orderBy('timestamp', 'desc')
    .onSnapshot(snapshot => {
      const settlements = snapshot.docs.map(doc => doc.data() as Settlement);
      callback(settlements);
    });
}
