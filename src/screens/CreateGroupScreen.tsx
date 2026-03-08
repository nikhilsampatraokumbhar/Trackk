import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGroups } from '../store/GroupContext';
import { useAuth } from '../store/AuthContext';
import { COLORS } from '../utils/helpers';

export default function CreateGroupScreen() {
  const nav = useNavigation();
  const { createGroup } = useGroups();
  const { user } = useAuth();
  const [groupName, setGroupName] = useState('');
  const [members, setMembers] = useState([{ name: '', phone: '' }]);
  const [loading, setLoading] = useState(false);
  const [isTrip, setIsTrip] = useState(false);

  const addMember = () => setMembers(prev => [...prev, { name: '', phone: '' }]);

  const updateMember = (i: number, field: 'name' | 'phone', value: string) => {
    setMembers(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  };

  const removeMember = (i: number) => {
    if (members.length > 1) {
      setMembers(prev => prev.filter((_, idx) => idx !== i));
    }
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      Alert.alert('Missing Name', 'Please enter a group name');
      return;
    }
    const validMembers = members.filter(m => m.name.trim());
    if (validMembers.length === 0) {
      Alert.alert('Missing Members', 'Please add at least one member');
      return;
    }
    // Check that all members have phone numbers (required for syncing)
    const missingPhone = validMembers.find(m => !m.phone.trim() || m.phone.replace(/\D/g, '').length < 10);
    if (missingPhone) {
      Alert.alert(
        'Phone Number Required',
        `Please enter a valid 10-digit phone number for ${missingPhone.name.trim()}. Phone numbers are used to sync group data between members.`,
      );
      return;
    }
    setLoading(true);
    try {
      await createGroup(
        groupName.trim(),
        validMembers.map(m => ({ displayName: m.name.trim(), phone: m.phone.trim() })),
        user?.id || 'local_user',
        isTrip,
      );
      nav.goBack();
    } catch {
      Alert.alert('Error', 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Group Name */}
      <View style={styles.section}>
        <Text style={styles.label}>GROUP NAME</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Goa Trip, Office Lunch"
          placeholderTextColor={COLORS.textLight}
          value={groupName}
          onChangeText={setGroupName}
          autoFocus
        />
      </View>

      {/* Trip Toggle */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.tripToggleRow}
          onPress={() => setIsTrip(prev => !prev)}
          activeOpacity={0.7}
        >
          <View style={styles.tripToggleInfo}>
            <Text style={styles.tripToggleLabel}>This is a trip</Text>
            <Text style={styles.tripToggleSubtitle}>
              Get a reminder to turn off tracking after 2–3 weeks
            </Text>
          </View>
          <View style={[
            styles.tripSwitch,
            isTrip && styles.tripSwitchActive,
          ]}>
            <View style={[
              styles.tripSwitchThumb,
              isTrip && styles.tripSwitchThumbActive,
            ]} />
            <Text style={[
              styles.tripSwitchText,
              isTrip && styles.tripSwitchTextActive,
            ]}>
              {isTrip ? 'ON' : 'OFF'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Members */}
      <View style={styles.section}>
        <Text style={styles.label}>MEMBERS</Text>
        <View style={styles.selfChip}>
          <View style={styles.selfDot} />
          <Text style={styles.selfText}>You are automatically included</Text>
        </View>

        {members.map((m, i) => (
          <View key={i} style={styles.memberRow}>
            <View style={styles.memberNumber}>
              <Text style={styles.memberNumberText}>{i + 1}</Text>
            </View>
            <View style={styles.memberInputs}>
              <TextInput
                style={[styles.input, { marginBottom: 8 }]}
                placeholder={`Member ${i + 1} name`}
                value={m.name}
                onChangeText={v => updateMember(i, 'name', v)}
                placeholderTextColor={COLORS.textLight}
              />
              <TextInput
                style={styles.input}
                placeholder="Phone number (required for sync)"
                value={m.phone}
                onChangeText={v => updateMember(i, 'phone', v)}
                keyboardType="phone-pad"
                placeholderTextColor={COLORS.textLight}
              />
            </View>
            {members.length > 1 && (
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeMember(i)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.addMemberBtn} onPress={addMember} activeOpacity={0.7}>
          <Text style={styles.addMemberIcon}>+</Text>
          <Text style={styles.addMemberText}>Add another member</Text>
        </TouchableOpacity>
      </View>

      {/* Create button */}
      <TouchableOpacity
        style={[styles.createBtn, loading && styles.disabledBtn]}
        onPress={handleCreate}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#0A0A0F" />
        ) : (
          <Text style={styles.createBtnText}>Create Group</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },

  section: { marginBottom: 24 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  selfChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.primary}12`,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${COLORS.primary}25`,
  },
  selfDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginRight: 8,
  },
  selfText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '500',
  },

  input: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
  },

  /* ── Trip Toggle ──────────────────────────────────────────────── */
  tripToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tripToggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  tripToggleLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  tripToggleSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  tripSwitch: {
    width: 56,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.surfaceHigher,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  tripSwitchActive: {
    backgroundColor: `${COLORS.primary}25`,
    borderColor: `${COLORS.primary}50`,
  },
  tripSwitchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.textSecondary,
  },
  tripSwitchThumbActive: {
    backgroundColor: COLORS.primary,
    transform: [{ translateX: 26 }],
  },
  tripSwitchText: {
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    position: 'absolute',
    right: 7,
  },
  tripSwitchTextActive: {
    color: COLORS.primary,
    left: 6,
    right: undefined,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 10,
  },
  memberNumber: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceHigher,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  memberNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  memberInputs: { flex: 1 },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${COLORS.danger}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    borderWidth: 1,
    borderColor: `${COLORS.danger}30`,
  },
  removeBtnText: {
    fontSize: 14,
    color: COLORS.danger,
    fontWeight: '700',
  },

  addMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${COLORS.primary}40`,
    borderStyle: 'dashed',
    gap: 8,
  },
  addMemberIcon: {
    fontSize: 18,
    color: COLORS.primary,
    fontWeight: '700',
  },
  addMemberText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14,
  },

  createBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  disabledBtn: { opacity: 0.5 },
  createBtnText: {
    color: '#0A0A0F',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
