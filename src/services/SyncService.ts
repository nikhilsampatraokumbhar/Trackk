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

/** Fetch a single group from Firestore by ID */
export async function getGroupCloud(groupId: string): Promise<Group | null> {
  const snapshot = await db.group(groupId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data()!;
  return {
    id: data.id,
    name: data.name,
    members: data.members,
    createdBy: data.createdBy,
    createdAt: data.createdAt,
    isTrip: data.isTrip,
  };
}

/** Update a group's fields in Firestore */
export async function updateGroupCloud(
  groupId: string,
  updates: Record<string, any>,
): Promise<void> {
  await db.group(groupId).update(updates);
}

/** Delete a group and all its sub-collections from Firestore */
export async function deleteGroupCloud(groupId: string): Promise<void> {
  // Delete all transactions
  const txnSnap = await db.groupTransactions(groupId).get();
  const batch1 = firestore().batch();
  txnSnap.docs.forEach(doc => batch1.delete(doc.ref));
  if (txnSnap.docs.length > 0) await batch1.commit();

  // Delete all settlements
  const settleSnap = await db.settlements(groupId).get();
  const batch2 = firestore().batch();
  settleSnap.docs.forEach(doc => batch2.delete(doc.ref));
  if (settleSnap.docs.length > 0) await batch2.commit();

  // Delete the group doc itself
  await db.group(groupId).delete();
}

/** Add a member to a group in Firestore */
export async function addMemberToGroupCloud(
  groupId: string,
  member: GroupMember,
): Promise<void> {
  const doc = await db.group(groupId).get();
  if (!doc.exists) return;
  const data = doc.data()!;
  const members: GroupMember[] = data.members || [];
  members.push(member);

  const normalizedPhone = member.phone.replace(/\D/g, '').slice(-10);
  await db.group(groupId).update({
    members,
    ...(normalizedPhone.length === 10 ? {
      memberPhones: firestore.FieldValue.arrayUnion(normalizedPhone),
    } : {}),
  });
}

/** Remove a member from a group in Firestore and settle their splits */
export async function removeMemberFromGroupCloud(
  groupId: string,
  memberUserId: string,
): Promise<void> {
  const doc = await db.group(groupId).get();
  if (!doc.exists) return;
  const data = doc.data()!;
  const removedMember = (data.members || []).find((m: GroupMember) => m.userId === memberUserId);
  const updatedMembers = (data.members || []).filter((m: GroupMember) => m.userId !== memberUserId);

  const updateData: Record<string, any> = {
    members: updatedMembers,
    memberIds: firestore.FieldValue.arrayRemove(memberUserId),
  };
  if (removedMember) {
    const normalizedPhone = removedMember.phone.replace(/\D/g, '').slice(-10);
    if (normalizedPhone.length === 10) {
      updateData.memberPhones = firestore.FieldValue.arrayRemove(normalizedPhone);
    }
  }
  await db.group(groupId).update(updateData);

  // Settle all their unsettled splits
  const txnSnap = await db.groupTransactions(groupId).get();
  for (const txnDoc of txnSnap.docs) {
    const txn = txnDoc.data() as GroupTransaction;
    const needsUpdate = txn.splits.some(s => s.userId === memberUserId && !s.settled);
    if (needsUpdate) {
      const updatedSplits = txn.splits.map(s =>
        s.userId === memberUserId ? { ...s, settled: true } : s,
      );
      await txnDoc.ref.update({ splits: updatedSplits });
    }
  }
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
  // Last person absorbs rounding difference so splits always sum to exact amount
  const totalFromSplits = splitAmount * members.length;
  const roundingDiff = Math.round((parsed.amount - totalFromSplits) * 100) / 100;

  const splits: Split[] = members.map((member, index) => ({
    userId: member.userId,
    displayName: member.userId === userId ? 'You' : member.displayName,
    amount: index === members.length - 1 ? splitAmount + roundingDiff : splitAmount,
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

/** Unsettle a split in a group transaction (in Firestore) */
export async function unsettleSplitCloud(
  groupId: string,
  transactionId: string,
  userId: string,
): Promise<void> {
  const docRef = db.groupTransaction(groupId, transactionId);
  const doc = await docRef.get();
  if (!doc.exists) return;

  const txn = doc.data() as GroupTransaction;
  const updatedSplits = txn.splits.map(s =>
    s.userId === userId ? { ...s, settled: false } : s,
  );

  await docRef.update({ splits: updatedSplits });
}

/** Remove a member from a split (in Firestore) */
export async function deleteGroupTransactionCloud(
  groupId: string,
  transactionId: string,
): Promise<void> {
  await db.groupTransaction(groupId, transactionId).delete();
}

export async function updateGroupTransactionCloud(
  groupId: string,
  transactionId: string,
  updates: Record<string, any>,
): Promise<void> {
  await db.groupTransaction(groupId, transactionId).update(updates);
}

export async function removeSplitMemberCloud(
  groupId: string,
  transactionId: string,
  memberUserId: string,
): Promise<void> {
  const docRef = db.groupTransaction(groupId, transactionId);
  const doc = await docRef.get();
  if (!doc.exists) return;

  const txn = doc.data() as GroupTransaction;
  const removedSplit = txn.splits.find(s => s.userId === memberUserId);
  if (!removedSplit) return;

  const newSplits = txn.splits.filter(s => s.userId !== memberUserId);
  if (newSplits.length === 0) return;

  // Redistribute removed member's share among non-payer members only
  const nonPayerSplits = newSplits.filter(s => s.userId !== txn.addedBy);
  let updatedSplits: Split[];
  if (nonPayerSplits.length > 0) {
    const extraPerPerson = Math.round((removedSplit.amount / nonPayerSplits.length) * 100) / 100;
    const totalExtra = extraPerPerson * nonPayerSplits.length;
    const roundingDiff = Math.round((removedSplit.amount - totalExtra) * 100) / 100;
    let applied = 0;
    updatedSplits = newSplits.map(s => {
      if (s.userId === txn.addedBy) return s;
      applied++;
      return {
        ...s,
        amount: s.amount + extraPerPerson + (applied === nonPayerSplits.length ? roundingDiff : 0),
      };
    });
  } else {
    updatedSplits = newSplits;
  }

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
