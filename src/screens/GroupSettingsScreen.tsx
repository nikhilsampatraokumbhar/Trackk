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
import { useTheme } from '../store/ThemeContext';
import { getGroup as getGroupLocal } from '../services/StorageService';
import { getGroupCloud } from '../services/SyncService';
import { Group, GroupMember, GroupType } from '../models/types';
import { simplifyDebts } from '../services/DebtCalculator';
import { getColorForId, generateId, formatCurrency } from '../utils/helpers';
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
  const { colors } = useTheme();
  const {
    groups, updateGroup, deleteGroup, addGroupMember, removeGroupMember,
    activeGroupDebts,
  } = useGroups();

  const [group, setGroup] = useState<Group | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<GroupType>('other');
  const [editImage, setEditImage] = useState<string | undefined>(undefined);
  const [editDescription, setEditDescription] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add member modal
  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');

  const userId = user?.id || '';

  const loadGroup = useCallback(async () => {
    const fromContext = groups.find(g => g.id === groupId);
    if (fromContext) {
      setGroup(fromContext);
      setEditName(fromContext.name);
      setEditType(fromContext.groupType || (fromContext.isTrip ? 'trip' : 'other'));
      setEditImage(fromContext.imageUri);
      setEditDescription(fromContext.description || '');
      return;
    }
    let g = await getGroupLocal(groupId);
    if (!g && isAuthenticated) {
      try { g = await getGroupCloud(groupId); } catch {}
    }
    if (g) {
      setGroup(g);
      setEditName(g.name);
      setEditType(g.groupType || (g.isTrip ? 'trip' : 'other'));
      setEditImage(g.imageUri);
      setEditDescription(g.description || '');
    }
  }, [groupId, groups, isAuthenticated]);

  useEffect(() => { loadGroup(); }, [loadGroup]);

  useEffect(() => {
    if (!group) return;
    const nameChanged = editName.trim() !== group.name;
    const typeChanged = editType !== (group.groupType || (group.isTrip ? 'trip' : 'other'));
    const imageChanged = editImage !== group.imageUri;
    const descChanged = editDescription.trim() !== (group.description || '');
    setHasChanges(nameChanged || typeChanged || imageChanged || descChanged);
  }, [editName, editType, editImage, editDescription, group]);

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
        description: editDescription.trim() || undefined,
      });
      setGroup(prev => prev ? { ...prev, name: trimmedName, groupType: editType, isTrip: editType === 'trip', imageUri: editImage, description: editDescription.trim() || undefined } : prev);
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

  const handleAddMember = async () => {
    const name = newMemberName.trim();
    const phone = newMemberPhone.trim();
    if (!name) { Alert.alert('Invalid', 'Please enter a name.'); return; }
    if (!phone) { Alert.alert('Invalid', 'Please enter a phone number.'); return; }
    const normalizedNew = phone.replace(/\D/g, '').slice(-10);
    const alreadyExists = group?.members.some(m => {
      const norm = m.phone.replace(/\D/g, '').slice(-10);
      return norm === normalizedNew && normalizedNew.length === 10;
    });
    if (alreadyExists) {
      Alert.alert('Duplicate', 'A member with this phone number already exists.');
      return;
    }
    const member: GroupMember = { userId: generateId(), displayName: name, phone };
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
          { text: 'Remove Anyway', style: 'destructive', onPress: async () => { await removeGroupMember(groupId, member.userId); await loadGroup(); } },
        ],
      );
      return;
    }
    Alert.alert('Remove member', `Remove ${member.displayName} from this group?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await removeGroupMember(groupId, member.userId); await loadGroup(); } },
    ]);
  };

  const handleTransferOwnership = (member: GroupMember) => {
    Alert.alert(
      'Transfer Ownership',
      `Make ${member.displayName} the admin of this group? You will no longer be able to delete the group.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Transfer', onPress: async () => {
          try {
            await updateGroup(groupId, { createdBy: member.userId });
            setGroup(prev => prev ? { ...prev, createdBy: member.userId } : prev);
            Alert.alert('Done', `${member.displayName} is now the group admin.`);
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to transfer ownership.');
          }
        }},
      ],
    );
  };

  const handleInviteLink = async () => {
    if (!group) return;
    const memberNames = group.members.map(m => m.displayName).join(', ');
    const message = `Hey! Join my group "${group.name}" on Trackk to split expenses easily.\n\nMembers: ${memberNames}\n\nGroup code: ${group.id}\n\nDownload Trackk and enter this code to join: https://trackk.app/join/${group.id}`;
    try { await Share.share({ message, title: `Join ${group.name} on Trackk` }); } catch {}
  };

  const handleLeaveGroup = () => {
    if (!group) return;
    const simplifiedDebts = simplifyDebts(activeGroupDebts);
    const userHasDebt = simplifiedDebts.some(d => d.fromUserId === userId || d.toUserId === userId);
    if (userHasDebt) {
      const totalOwing = simplifiedDebts.filter(d => d.fromUserId === userId).reduce((s, d) => s + d.amount, 0);
      const totalOwed = simplifiedDebts.filter(d => d.toUserId === userId).reduce((s, d) => s + d.amount, 0);
      let debtMsg = 'You have outstanding debts in this group:\n';
      if (totalOwing > 0) debtMsg += `\nYou owe: ${formatCurrency(totalOwing)}`;
      if (totalOwed > 0) debtMsg += `\nYou are owed: ${formatCurrency(totalOwed)}`;
      debtMsg += '\n\nPlease settle all debts before leaving.';
      Alert.alert('Cannot leave group', debtMsg);
      return;
    }
    Alert.alert('Leave group', `Are you sure you want to leave "${group.name}"? You won't see this group's expenses anymore.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => { await removeGroupMember(groupId, userId); nav.navigate('MainTabs'); } },
    ]);
  };

  const handleDeleteGroup = () => {
    if (!group) return;
    if (group.createdBy !== userId) {
      Alert.alert('Not allowed', 'Only the group creator can delete this group.');
      return;
    }
    Alert.alert('Delete group', `Permanently delete "${group.name}" and all its expenses? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteGroup(groupId); nav.navigate('MainTabs'); } },
    ]);
  };

  if (!group) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Loading...</Text>
      </View>
    );
  }

  const groupColor = getColorForId(group.id);
  const isCreator = group.createdBy === userId;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Customize Group */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CUSTOMIZE GROUP</Text>

          <TouchableOpacity style={[styles.imageRow, { borderBottomColor: colors.border }]} onPress={handlePickImage} activeOpacity={0.7}>
            {editImage ? (
              <Image source={{ uri: editImage }} style={styles.groupImage} />
            ) : (
              <View style={[styles.groupImagePlaceholder, { backgroundColor: `${groupColor}15` }]}>
                <Text style={[styles.groupImageInitial, { color: groupColor }]}>
                  {(editName || group.name || 'G')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.imageTextCol}>
              <Text style={[styles.imageLabel, { color: colors.text }]}>Group Photo</Text>
              <Text style={[styles.imageSub, { color: colors.textSecondary }]}>Tap to {editImage ? 'change' : 'add'} photo</Text>
            </View>
            {editImage && (
              <TouchableOpacity onPress={handleRemoveImage} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={[styles.removeImageText, { color: colors.danger }]}>Remove</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>GROUP NAME</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.surfaceHigh, borderColor: colors.border, color: colors.text }]}
            value={editName}
            onChangeText={setEditName}
            placeholder="Group name"
            placeholderTextColor={colors.textLight}
            maxLength={50}
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>DESCRIPTION (OPTIONAL)</Text>
          <TextInput
            style={[styles.textInput, { minHeight: 60, backgroundColor: colors.surfaceHigh, borderColor: colors.border, color: colors.text }]}
            value={editDescription}
            onChangeText={setEditDescription}
            placeholder="Add a group description or notes..."
            placeholderTextColor={colors.textLight}
            maxLength={200}
            multiline
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>GROUP TYPE</Text>
          <View style={styles.typeGrid}>
            {GROUP_TYPES.map(t => {
              const selected = editType === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.typeChip, { borderColor: colors.border, backgroundColor: colors.surfaceHigh }, selected && { borderColor: groupColor, backgroundColor: `${groupColor}10` }]}
                  onPress={() => setEditType(t.value)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.typeIcon}>{t.icon}</Text>
                  <Text style={[styles.typeLabel, { color: colors.textSecondary }, selected && { color: colors.text }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {hasChanges && (
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.5 }]}
              onPress={handleSaveCustomization}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Members */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>MEMBERS ({group.members.length})</Text>
            <TouchableOpacity
              style={[styles.addMemberBtn, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}
              onPress={() => setAddMemberVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.addMemberBtnText, { color: colors.primary }]}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {group.members.map(member => {
            const isMe = member.userId === userId;
            const isGroupCreator = member.userId === group.createdBy;
            const memberColor = getColorForId(member.userId);
            return (
              <View key={member.userId} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.memberAvatar, { backgroundColor: `${memberColor}15` }]}>
                  <Text style={[styles.memberAvatarText, { color: memberColor }]}>
                    {(isMe ? 'Y' : member.displayName[0]).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={[styles.memberName, { color: colors.text }]}>
                      {isMe ? 'You' : member.displayName}
                    </Text>
                    {isGroupCreator && (
                      <View style={[styles.creatorBadge, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
                        <Text style={[styles.creatorBadgeText, { color: colors.primary }]}>Admin</Text>
                      </View>
                    )}
                  </View>
                  {member.phone ? <Text style={[styles.memberPhone, { color: colors.textSecondary }]}>{member.phone}</Text> : null}
                </View>
                {isCreator && !isMe && !isGroupCreator && (
                  <TouchableOpacity onPress={() => handleTransferOwnership(member)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginRight: 10 }}>
                    <Text style={[styles.transferText, { color: colors.primary }]}>Make Admin</Text>
                  </TouchableOpacity>
                )}
                {!isMe && !isGroupCreator && (
                  <TouchableOpacity onPress={() => handleRemoveMember(member)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={[styles.removeMemberText, { color: colors.danger }]}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Invite */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.actionRow} onPress={handleInviteLink} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}10` }]}>
              <Text style={styles.actionEmoji}>🔗</Text>
            </View>
            <View style={styles.actionInfo}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Invite via Link</Text>
              <Text style={[styles.actionSub, { color: colors.textSecondary }]}>Share a link for others to join</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.danger }]}>DANGER ZONE</Text>

          {group.archived && (
            <TouchableOpacity style={[styles.dangerRow, { borderBottomColor: colors.border }]} onPress={() => {
              Alert.alert('Unarchive Group', `Restore "${group.name}" from archive?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Unarchive', onPress: async () => {
                  await updateGroup(groupId, { archived: false });
                  setGroup(prev => prev ? { ...prev, archived: false } : prev);
                  Alert.alert('Done', 'Group has been unarchived.');
                }},
              ]);
            }} activeOpacity={0.7}>
              <View style={[styles.actionIcon, { backgroundColor: `${colors.success}10` }]}>
                <Text style={styles.actionEmoji}>📦</Text>
              </View>
              <View style={styles.actionInfo}>
                <Text style={[styles.actionTitle, { color: colors.success }]}>Unarchive Group</Text>
                <Text style={[styles.actionSub, { color: colors.textSecondary }]}>Restore this group from archive</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.dangerRow, { borderBottomColor: colors.border }]} onPress={handleLeaveGroup} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: `${colors.warning}10` }]}>
              <Text style={styles.actionEmoji}>🚪</Text>
            </View>
            <View style={styles.actionInfo}>
              <Text style={[styles.actionTitle, { color: colors.warning }]}>Leave Group</Text>
              <Text style={[styles.actionSub, { color: colors.textSecondary }]}>You can only leave after all debts are settled</Text>
            </View>
          </TouchableOpacity>

          {isCreator && (
            <TouchableOpacity style={[styles.dangerRow, { borderBottomColor: colors.border }]} onPress={handleDeleteGroup} activeOpacity={0.7}>
              <View style={[styles.actionIcon, { backgroundColor: `${colors.danger}10` }]}>
                <Text style={styles.actionEmoji}>🗑️</Text>
              </View>
              <View style={styles.actionInfo}>
                <Text style={[styles.actionTitle, { color: colors.danger }]}>Delete Group</Text>
                <Text style={[styles.actionSub, { color: colors.textSecondary }]}>Permanently delete this group and all data</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Member Bottom Sheet */}
      <BottomSheet visible={addMemberVisible} onClose={() => setAddMemberVisible(false)}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>Add Member</Text>
        <Text style={[styles.modalSub, { color: colors.textSecondary }]}>Add a new person to this group</Text>

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>NAME</Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.surfaceHigh, borderColor: colors.border, color: colors.text }]}
          value={newMemberName}
          onChangeText={setNewMemberName}
          placeholder="e.g. John"
          placeholderTextColor={colors.textLight}
          maxLength={50}
          autoFocus
        />

        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>PHONE NUMBER</Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.surfaceHigh, borderColor: colors.border, color: colors.text }]}
          value={newMemberPhone}
          onChangeText={setNewMemberPhone}
          placeholder="e.g. 9876543210"
          placeholderTextColor={colors.textLight}
          keyboardType="phone-pad"
          maxLength={15}
        />

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleAddMember} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>Add to Group</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cancelBtn, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
          onPress={() => { setAddMemberVisible(false); setNewMemberName(''); setNewMemberPhone(''); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14 },

  section: {
    marginHorizontal: 16, marginTop: 20,
    borderRadius: 12, padding: 16,
    borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 16 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },

  imageRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1 },
  groupImage: { width: 56, height: 56, borderRadius: 14, marginRight: 14 },
  groupImagePlaceholder: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  groupImageInitial: { fontSize: 24, fontWeight: '800' },
  imageTextCol: { flex: 1 },
  imageLabel: { fontSize: 15, fontWeight: '600' },
  imageSub: { fontSize: 12, marginTop: 2 },
  removeImageText: { fontSize: 13, fontWeight: '600' },

  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  textInput: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, borderWidth: 1, marginBottom: 4 },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  typeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  typeIcon: { fontSize: 16, marginRight: 6 },
  typeLabel: { fontSize: 13, fontWeight: '600' },

  addMemberBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  addMemberBtnText: { fontSize: 13, fontWeight: '700' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  memberAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  memberAvatarText: { fontSize: 17, fontWeight: '800' },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: { fontSize: 15, fontWeight: '600' },
  memberPhone: { fontSize: 12, marginTop: 2 },
  creatorBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  creatorBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  removeMemberText: { fontSize: 13, fontWeight: '600' },
  transferText: { fontSize: 12, fontWeight: '600' },

  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  actionEmoji: { fontSize: 20 },
  actionInfo: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '600' },
  actionSub: { fontSize: 12, marginTop: 2 },

  saveBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  cancelBtn: { alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1, marginTop: 10 },
  cancelBtnText: { fontSize: 14, fontWeight: '700' },

  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  modalSub: { fontSize: 13, marginBottom: 20 },
});
