import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Share, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useGroups } from '../store/GroupContext';
import { useAuth } from '../store/AuthContext';
import { getGroup as getGroupLocal } from '../services/StorageService';
import { getGroupCloud } from '../services/SyncService';
import { Group, GroupMember, GroupType } from '../models/types';
import { simplifyDebts } from '../services/DebtCalculator';
import { COLORS, getColorForId, generateId, formatCurrency } from '../utils/helpers';
import BottomSheet from '../components/BottomSheet';

type Route = RouteProp<RootStackParamList, 'GroupSettings'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const GROUP_TYPES: { value: GroupType; label: string; icon: string }[] = [
  { value: 'trip', label: 'Trip', icon: '✈️' },
  { value: 'expenses', label: 'Expenses', icon: '💰' },
  { value: 'couple', label: 'Couple', icon: '❤️' },
  { value: 'roommates', label: 'Roommates', icon: '🏠' },
  { value: 'party', label: 'Party', icon: '🎉' },
  { value: 'other', label: 'Other', icon: '📋' },
];

export default function GroupSettingsScreen() {
  const route = useRoute<Route>();
  const nav = useNavigation<Nav>();
  const { groupId } = route.params;
  const { user, isAuthenticated } = useAuth();
  const {
    groups, updateGroup, deleteGroup, addGroupMember, removeGroupMember,
    activeGroupDebts,
  } = useGroups();

  const [group, setGroup] = useState<Group | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<GroupType>('other');
  const [editImage, setEditImage] = useState<string | undefined>(undefined);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add member modal
  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');

  const userId = user?.id || '';

  const loadGroup = useCallback(async () => {
    // Try from context first
    const fromContext = groups.find(g => g.id === groupId);
    if (fromContext) {
      setGroup(fromContext);
      setEditName(fromContext.name);
      setEditType(fromContext.groupType || (fromContext.isTrip ? 'trip' : 'other'));
      setEditImage(fromContext.imageUri);
      return;
    }
    // Fallback to local/cloud
    let g = await getGroupLocal(groupId);
    if (!g && isAuthenticated) {
      try { g = await getGroupCloud(groupId); } catch {}
    }
    if (g) {
      setGroup(g);
      setEditName(g.name);
      setEditType(g.groupType || (g.isTrip ? 'trip' : 'other'));
      setEditImage(g.imageUri);
    }
  }, [groupId, groups, isAuthenticated]);

  useEffect(() => { loadGroup(); }, [loadGroup]);

  // Detect changes
  useEffect(() => {
    if (!group) return;
    const nameChanged = editName.trim() !== group.name;
    const typeChanged = editType !== (group.groupType || (group.isTrip ? 'trip' : 'other'));
    const imageChanged = editImage !== group.imageUri;
    setHasChanges(nameChanged || typeChanged || imageChanged);
  }, [editName, editType, editImage, group]);

  const handleSaveCustomization = async () => {
    if (!group) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      Alert.alert('Invalid', 'Group name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await updateGroup(groupId, {
        name: trimmedName,
        groupType: editType,
        isTrip: editType === 'trip',
        imageUri: editImage,
      });
      setGroup(prev => prev ? { ...prev, name: trimmedName, groupType: editType, isTrip: editType === 'trip', imageUri: editImage } : prev);
      setHasChanges(false);
      Alert.alert('Saved', 'Group settings updated.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update group.');
    } finally {
      setSaving(false);
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setEditImage(result.assets[0].uri);
    }
  };

  const handleRemoveImage = () => {
    setEditImage(undefined);
  };

  // ─── Members ────────────────────────────────────────────────────────────────
  const handleAddMember = async () => {
    const name = newMemberName.trim();
    const phone = newMemberPhone.trim();
    if (!name) {
      Alert.alert('Invalid', 'Please enter a name.');
      return;
    }
    if (!phone) {
      Alert.alert('Invalid', 'Please enter a phone number.');
      return;
    }
    // Check for duplicate phone
    const normalizedNew = phone.replace(/\D/g, '').slice(-10);
    const alreadyExists = group?.members.some(m => {
      const norm = m.phone.replace(/\D/g, '').slice(-10);
      return norm === normalizedNew && normalizedNew.length === 10;
    });
    if (alreadyExists) {
      Alert.alert('Duplicate', 'A member with this phone number already exists.');
      return;
    }

    const member: GroupMember = {
      userId: generateId(),
      displayName: name,
      phone,
    };

    try {
      await addGroupMember(groupId, member);
      setAddMemberVisible(false);
      setNewMemberName('');
      setNewMemberPhone('');
      await loadGroup();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add member.');
    }
  };

  const handleRemoveMember = (member: GroupMember) => {
    if (member.userId === userId) {
      Alert.alert('Cannot remove', 'Use "Leave Group" to remove yourself.');
      return;
    }
    if (member.userId === group?.createdBy) {
      Alert.alert('Cannot remove', 'The group creator cannot be removed.');
      return;
    }

    // Check if this member has unsettled debts
    const simplifiedDebts = simplifyDebts(activeGroupDebts);
    const memberHasDebt = simplifiedDebts.some(
      d => d.fromUserId === member.userId || d.toUserId === member.userId,
    );

    if (memberHasDebt) {
      Alert.alert(
        'Outstanding debts',
        `${member.displayName} has unsettled debts. All their splits will be marked as settled if removed.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove Anyway',
            style: 'destructive',
            onPress: async () => {
              await removeGroupMember(groupId, member.userId);
              await loadGroup();
            },
          },
        ],
      );
      return;
    }

    Alert.alert(
      'Remove member',
      `Remove ${member.displayName} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeGroupMember(groupId, member.userId);
            await loadGroup();
          },
        },
      ],
    );
  };

  // ─── Invite ─────────────────────────────────────────────────────────────────
  const handleInviteLink = async () => {
    if (!group) return;
    const memberNames = group.members.map(m => m.displayName).join(', ');
    const message = `Hey! Join my group "${group.name}" on Trackk to split expenses easily.\n\n` +
      `Members: ${memberNames}\n\n` +
      `Group code: ${group.id}\n\n` +
      `Download Trackk and enter this code to join: https://trackk.app/join/${group.id}`;
    try {
      await Share.share({ message, title: `Join ${group.name} on Trackk` });
    } catch {}
  };

  // ─── Leave Group ────────────────────────────────────────────────────────────
  const handleLeaveGroup = () => {
    if (!group) return;

    // Check for outstanding debts
    const simplifiedDebts = simplifyDebts(activeGroupDebts);
    const userHasDebt = simplifiedDebts.some(
      d => d.fromUserId === userId || d.toUserId === userId,
    );

    if (userHasDebt) {
      const totalOwing = simplifiedDebts
        .filter(d => d.fromUserId === userId)
        .reduce((s, d) => s + d.amount, 0);
      const totalOwed = simplifiedDebts
        .filter(d => d.toUserId === userId)
        .reduce((s, d) => s + d.amount, 0);

      let debtMsg = 'You have outstanding debts in this group:\n';
      if (totalOwing > 0) debtMsg += `\nYou owe: ${formatCurrency(totalOwing)}`;
      if (totalOwed > 0) debtMsg += `\nYou are owed: ${formatCurrency(totalOwed)}`;
      debtMsg += '\n\nPlease settle all debts before leaving.';

      Alert.alert('Cannot leave group', debtMsg);
      return;
    }

    Alert.alert(
      'Leave group',
      `Are you sure you want to leave "${group.name}"? You won't see this group's expenses anymore.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await removeGroupMember(groupId, userId);
            nav.navigate('MainTabs');
          },
        },
      ],
    );
  };

  // ─── Delete Group ───────────────────────────────────────────────────────────
  const handleDeleteGroup = () => {
    if (!group) return;

    if (group.createdBy !== userId) {
      Alert.alert('Not allowed', 'Only the group creator can delete this group.');
      return;
    }

    Alert.alert(
      'Delete group',
      `Permanently delete "${group.name}" and all its expenses? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteGroup(groupId);
            nav.navigate('MainTabs');
          },
        },
      ],
    );
  };

  if (!group) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Loading...</Text>
      </View>
    );
  }

  const groupColor = getColorForId(group.id);
  const isCreator = group.createdBy === userId;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* ─── Customize Group ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CUSTOMIZE GROUP</Text>

          {/* Group Image */}
          <TouchableOpacity style={styles.imageRow} onPress={handlePickImage} activeOpacity={0.7}>
            {editImage ? (
              <Image source={{ uri: editImage }} style={styles.groupImage} />
            ) : (
              <View style={[styles.groupImagePlaceholder, { backgroundColor: `${groupColor}25` }]}>
                <Text style={[styles.groupImageInitial, { color: groupColor }]}>
                  {(editName || group.name || 'G')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.imageTextCol}>
              <Text style={styles.imageLabel}>Group Photo</Text>
              <Text style={styles.imageSub}>Tap to {editImage ? 'change' : 'add'} photo</Text>
            </View>
            {editImage && (
              <TouchableOpacity onPress={handleRemoveImage} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.removeImageText}>Remove</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {/* Group Name */}
          <Text style={styles.fieldLabel}>GROUP NAME</Text>
          <TextInput
            style={styles.textInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Group name"
            placeholderTextColor={COLORS.textLight}
            maxLength={50}
          />

          {/* Group Type */}
          <Text style={styles.fieldLabel}>GROUP TYPE</Text>
          <View style={styles.typeGrid}>
            {GROUP_TYPES.map(t => {
              const selected = editType === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.typeChip, selected && { borderColor: groupColor, backgroundColor: `${groupColor}15` }]}
                  onPress={() => setEditType(t.value)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.typeIcon}>{t.icon}</Text>
                  <Text style={[styles.typeLabel, selected && { color: COLORS.text }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Save button */}
          {hasChanges && (
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.5 }]}
              onPress={handleSaveCustomization}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ─── Members ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>MEMBERS ({group.members.length})</Text>
            <TouchableOpacity
              style={styles.addMemberBtn}
              onPress={() => setAddMemberVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.addMemberBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {group.members.map(member => {
            const isMe = member.userId === userId;
            const isGroupCreator = member.userId === group.createdBy;
            const memberColor = getColorForId(member.userId);

            return (
              <View key={member.userId} style={styles.memberRow}>
                <View style={[styles.memberAvatar, { backgroundColor: `${memberColor}20` }]}>
                  <Text style={[styles.memberAvatarText, { color: memberColor }]}>
                    {(isMe ? 'Y' : member.displayName[0]).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={styles.memberName}>
                      {isMe ? 'You' : member.displayName}
                    </Text>
                    {isGroupCreator && (
                      <View style={styles.creatorBadge}>
                        <Text style={styles.creatorBadgeText}>Admin</Text>
                      </View>
                    )}
                  </View>
                  {member.phone ? (
                    <Text style={styles.memberPhone}>{member.phone}</Text>
                  ) : null}
                </View>
                {!isMe && !isGroupCreator && (
                  <TouchableOpacity
                    onPress={() => handleRemoveMember(member)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.removeMemberText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* ─── Invite ──────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={handleInviteLink} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: `${COLORS.primaryLight}15` }]}>
              <Text style={styles.actionEmoji}>🔗</Text>
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Invite via Link</Text>
              <Text style={styles.actionSub}>Share a link for others to join</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ─── Danger Zone ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: COLORS.danger }]}>DANGER ZONE</Text>

          <TouchableOpacity style={styles.dangerRow} onPress={handleLeaveGroup} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: `${COLORS.warning}15` }]}>
              <Text style={styles.actionEmoji}>🚪</Text>
            </View>
            <View style={styles.actionInfo}>
              <Text style={[styles.actionTitle, { color: COLORS.warning }]}>Leave Group</Text>
              <Text style={styles.actionSub}>You can only leave after all debts are settled</Text>
            </View>
          </TouchableOpacity>

          {isCreator && (
            <TouchableOpacity style={styles.dangerRow} onPress={handleDeleteGroup} activeOpacity={0.7}>
              <View style={[styles.actionIcon, { backgroundColor: `${COLORS.danger}15` }]}>
                <Text style={styles.actionEmoji}>🗑️</Text>
              </View>
              <View style={styles.actionInfo}>
                <Text style={[styles.actionTitle, { color: COLORS.danger }]}>Delete Group</Text>
                <Text style={styles.actionSub}>Permanently delete this group and all data</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ─── Add Member Bottom Sheet ──────────────────────────────────── */}
      <BottomSheet visible={addMemberVisible} onClose={() => setAddMemberVisible(false)}>
        <Text style={styles.modalTitle}>Add Member</Text>
        <Text style={styles.modalSub}>Add a new person to this group</Text>

        <Text style={styles.fieldLabel}>NAME</Text>
        <TextInput
          style={styles.textInput}
          value={newMemberName}
          onChangeText={setNewMemberName}
          placeholder="e.g. John"
          placeholderTextColor={COLORS.textLight}
          maxLength={50}
          autoFocus
        />

        <Text style={[styles.fieldLabel, { marginTop: 16 }]}>PHONE NUMBER</Text>
        <TextInput
          style={styles.textInput}
          value={newMemberPhone}
          onChangeText={setNewMemberPhone}
          placeholder="e.g. 9876543210"
          placeholderTextColor={COLORS.textLight}
          keyboardType="phone-pad"
          maxLength={15}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleAddMember} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>Add to Group</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => { setAddMemberVisible(false); setNewMemberName(''); setNewMemberPhone(''); }}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },

  // ─── Sections ──────────────────────────────────────────────────────────────
  section: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.2,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  // ─── Image ─────────────────────────────────────────────────────────────────
  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  groupImage: {
    width: 56,
    height: 56,
    borderRadius: 14,
    marginRight: 14,
  },
  groupImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  groupImageInitial: { fontSize: 24, fontWeight: '800' },
  imageTextCol: { flex: 1 },
  imageLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  imageSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  removeImageText: { fontSize: 13, fontWeight: '600', color: COLORS.danger },

  // ─── Fields ────────────────────────────────────────────────────────────────
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 4,
  },

  // ─── Type Grid ─────────────────────────────────────────────────────────────
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceHigh,
  },
  typeIcon: { fontSize: 16, marginRight: 6 },
  typeLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },

  // ─── Members ───────────────────────────────────────────────────────────────
  addMemberBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: `${COLORS.primary}18`,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  addMemberBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberAvatarText: { fontSize: 17, fontWeight: '800' },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  memberPhone: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  creatorBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: `${COLORS.primary}18`,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  creatorBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.5 },
  removeMemberText: { fontSize: 13, fontWeight: '600', color: COLORS.danger },

  // ─── Action Rows ───────────────────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionEmoji: { fontSize: 20 },
  actionInfo: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  actionSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  // ─── Buttons ───────────────────────────────────────────────────────────────
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceHigh,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 10,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },

  // ─── Modal ─────────────────────────────────────────────────────────────────
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  modalSub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 20 },
});
