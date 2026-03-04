import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGroups } from '../store/GroupContext';
import { COLORS } from '../utils/helpers';
import { getUserByPhone } from '../services/FirebaseService';

interface MemberInput {
  id: string;
  displayName: string;
  phone: string;
  resolvedName?: string; // set if phone matched a registered user
}

export function CreateGroupScreen() {
  const navigation = useNavigation();
  const { createGroup } = useGroups();

  const [groupName, setGroupName] = useState('');
  const [members, setMembers] = useState<MemberInput[]>([
    { id: '1', displayName: '', phone: '' },
  ]);
  const [creating, setCreating] = useState(false);

  const addMember = () => {
    setMembers(prev => [
      ...prev,
      { id: String(Date.now()), displayName: '', phone: '' },
    ]);
  };

  const removeMember = (id: string) => {
    if (members.length <= 1) return;
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const updateMember = (id: string, field: 'displayName' | 'phone', value: string) => {
    setMembers(prev =>
      prev.map(m => (m.id === id ? { ...m, [field]: value, resolvedName: field === 'phone' ? undefined : m.resolvedName } : m)),
    );
    // When a 10-digit phone is entered, look up registered user
    if (field === 'phone' && value.replace(/\D/g, '').length === 10) {
      const cleaned = value.replace(/\D/g, '');
      const fullPhone = `+91${cleaned}`;
      getUserByPhone(fullPhone).then(found => {
        if (found) {
          setMembers(prev =>
            prev.map(m =>
              m.id === id
                ? { ...m, phone: value, resolvedName: found.displayName, displayName: found.displayName }
                : m,
            ),
          );
        }
      });
    }
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    const validMembers = members.filter(m => m.displayName.trim());
    if (validMembers.length === 0) {
      Alert.alert('Error', 'Add at least one member');
      return;
    }

    setCreating(true);
    try {
      await createGroup(
        groupName.trim(),
        validMembers.map(m => ({
          displayName: m.displayName.trim(),
          phone: m.phone.trim(),
        })),
      );
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', 'Failed to create group. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={members}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            {/* Group name */}
            <Text style={styles.label}>Group Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Roommates, Trip to Goa"
              placeholderTextColor={COLORS.textLight}
              value={groupName}
              onChangeText={setGroupName}
            />

            {/* Members header */}
            <View style={styles.membersHeader}>
              <Text style={styles.label}>Members</Text>
              <Text style={styles.memberCount}>
                {members.length} member{members.length !== 1 ? 's' : ''} + you
              </Text>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.memberCard}>
            <View style={styles.memberNumber}>
              <Text style={styles.memberNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.memberInputs}>
              <TextInput
                style={styles.memberInput}
                placeholder="Name"
                placeholderTextColor={COLORS.textLight}
                value={item.displayName}
                onChangeText={v => updateMember(item.id, 'displayName', v)}
              />
              <TextInput
                style={styles.memberInput}
                placeholder="Phone (optional)"
                placeholderTextColor={COLORS.textLight}
                value={item.phone}
                onChangeText={v => updateMember(item.id, 'phone', v)}
                keyboardType="phone-pad"
              />
              {item.resolvedName ? (
                <View style={styles.foundBadge}>
                  <Text style={styles.foundBadgeText}>
                    Found on app · {item.resolvedName}
                  </Text>
                </View>
              ) : null}
            </View>
            {members.length > 1 && (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeMember(item.id)}>
                <Text style={styles.removeText}>X</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <TouchableOpacity style={styles.addMemberButton} onPress={addMember}>
              <Text style={styles.addMemberText}>+ Add Another Member</Text>
            </TouchableOpacity>

            {/* Split preview */}
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>Split Preview</Text>
              <Text style={styles.previewText}>
                Expenses will be split equally among {members.length + 1} people
                (including you).
              </Text>
              <Text style={styles.previewExample}>
                e.g., A ₹1,000 expense → ₹
                {Math.round(1000 / (members.length + 1))} each
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.createButton, creating && styles.createButtonDisabled]}
              onPress={handleCreate}
              disabled={creating}
              activeOpacity={0.8}>
              <Text style={styles.createButtonText}>
                {creating ? 'Creating...' : 'Create Group'}
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  membersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 16,
  },
  memberCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  memberNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.groupColor + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  memberNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.groupColor,
  },
  memberInputs: {
    flex: 1,
  },
  memberInput: {
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: 4,
  },
  foundBadge: {
    backgroundColor: COLORS.success + '20',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  foundBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.success,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.danger + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  removeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
  footer: {
    paddingBottom: 30,
  },
  addMemberButton: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.groupColor,
    borderStyle: 'dashed',
  },
  addMemberText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.groupColor,
  },
  previewCard: {
    backgroundColor: COLORS.groupColor + '10',
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 10,
    padding: 16,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.groupColor,
    marginBottom: 6,
  },
  previewText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  previewExample: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
    marginTop: 6,
  },
  createButton: {
    backgroundColor: COLORS.groupColor,
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 2,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
