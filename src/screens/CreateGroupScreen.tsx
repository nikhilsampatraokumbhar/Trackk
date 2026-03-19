import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGroups } from '../store/GroupContext';
import { useAuth } from '../store/AuthContext';
import { useTheme } from '../store/ThemeContext';

export default function CreateGroupScreen() {
  const nav = useNavigation();
  const { createGroup } = useGroups();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [groupName, setGroupName] = useState('');
  const [members, setMembers] = useState([{ name: '', phone: '' }]);
  const [loading, setLoading] = useState(false);
  const [isTrip, setIsTrip] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

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
    // Check for duplicate phone numbers
    const normalizedPhones = validMembers.map(m => m.phone.replace(/\D/g, '').slice(-10));
    const seen = new Set<string>();
    for (let i = 0; i < normalizedPhones.length; i++) {
      if (seen.has(normalizedPhones[i])) {
        Alert.alert(
          'Duplicate Phone Number',
          `${validMembers[i].name.trim()} has the same phone number as another member. Each member must have a unique phone number.`,
        );
        return;
      }
      seen.add(normalizedPhones[i]);
    }
    const parsedBudget = parseFloat(budgetInput);
    if (budgetInput.trim() && (isNaN(parsedBudget) || parsedBudget <= 0)) {
      Alert.alert('Invalid budget', 'Budget must be a positive amount.');
      return;
    }

    setLoading(true);
    try {
      const budgetAmount = parsedBudget > 0 ? parsedBudget : undefined;
      await createGroup(
        groupName.trim(),
        validMembers.map(m => ({ displayName: m.name.trim(), phone: m.phone.trim() })),
        user?.id || 'local_user',
        isTrip,
        budgetAmount,
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
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Group Name */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>GROUP NAME</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholder="e.g. Goa Trip, Office Lunch"
          placeholderTextColor={colors.textLight}
          value={groupName}
          onChangeText={setGroupName}
          autoFocus
        />
      </View>

      {/* Trip Toggle */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.tripToggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => setIsTrip(prev => !prev)}
          activeOpacity={0.7}
        >
          <View style={styles.tripToggleInfo}>
            <Text style={[styles.tripToggleLabel, { color: colors.text }]}>This is a trip</Text>
            <Text style={[styles.tripToggleSubtitle, { color: colors.textSecondary }]}>
              Get a reminder to turn off tracking after 2-3 weeks
            </Text>
          </View>
          <View style={[
            styles.tripSwitch,
            { backgroundColor: colors.surfaceHigher, borderColor: colors.border },
            isTrip && { backgroundColor: `${colors.primary}20`, borderColor: `${colors.primary}50` },
          ]}>
            <View style={[
              styles.tripSwitchThumb,
              { backgroundColor: colors.textSecondary },
              isTrip && { backgroundColor: colors.primary, transform: [{ translateX: 26 }] },
            ]} />
            <Text style={[
              styles.tripSwitchText,
              { color: colors.textSecondary },
              isTrip && { color: colors.primary, left: 6, right: undefined },
            ]}>
              {isTrip ? 'ON' : 'OFF'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Budget (optional) */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>BUDGET (OPTIONAL)</Text>
        <View style={styles.budgetRow}>
          <Text style={[styles.budgetPrefix, { color: colors.primary }]}>₹</Text>
          <TextInput
            style={[styles.input, styles.budgetInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="e.g. 5000 — leave empty to skip"
            placeholderTextColor={colors.textLight}
            value={budgetInput}
            onChangeText={setBudgetInput}
            keyboardType="numeric"
          />
        </View>
        <Text style={[styles.budgetHint, { color: colors.textSecondary }]}>
          Set a spending limit for this group/trip. Shows progress on the group card.
        </Text>
      </View>

      {/* Members */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>MEMBERS</Text>
        <View style={[styles.selfChip, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
          <View style={[styles.selfDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.selfText, { color: colors.primary }]}>You are automatically included</Text>
        </View>

        {members.map((m, i) => (
          <View key={i} style={styles.memberRow}>
            <View style={[styles.memberNumber, { backgroundColor: colors.surfaceHigher, borderColor: colors.border }]}>
              <Text style={[styles.memberNumberText, { color: colors.textSecondary }]}>{i + 1}</Text>
            </View>
            <View style={styles.memberInputs}>
              <TextInput
                style={[styles.input, { marginBottom: 8, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder={`Member ${i + 1} name`}
                value={m.name}
                onChangeText={v => updateMember(i, 'name', v)}
                placeholderTextColor={colors.textLight}
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="Phone number (required for sync)"
                value={m.phone}
                onChangeText={v => updateMember(i, 'phone', v)}
                keyboardType="phone-pad"
                placeholderTextColor={colors.textLight}
              />
            </View>
            {members.length > 1 && (
              <TouchableOpacity
                style={[styles.removeBtn, { backgroundColor: `${colors.danger}10`, borderColor: `${colors.danger}30` }]}
                onPress={() => removeMember(i)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.removeBtnText, { color: colors.danger }]}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <TouchableOpacity style={[styles.addMemberBtn, { borderColor: `${colors.primary}40` }]} onPress={addMember} activeOpacity={0.7}>
          <Text style={[styles.addMemberIcon, { color: colors.primary }]}>+</Text>
          <Text style={[styles.addMemberText, { color: colors.primary }]}>Add another member</Text>
        </TouchableOpacity>
      </View>

      {/* Create button */}
      <TouchableOpacity
        style={[styles.createBtn, { backgroundColor: colors.primary }, loading && styles.disabledBtn]}
        onPress={handleCreate}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.createBtnText}>Create Group</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  section: { marginBottom: 24 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  selfChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
  },
  selfDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  selfText: {
    fontSize: 13,
    fontWeight: '500',
  },

  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
  },

  tripToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  tripToggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  tripToggleLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  tripToggleSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  tripSwitch: {
    width: 56,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  tripSwitchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  tripSwitchText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    position: 'absolute',
    right: 7,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    borderWidth: 1,
  },
  memberNumberText: {
    fontSize: 11,
    fontWeight: '700',
  },
  memberInputs: { flex: 1 },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    borderWidth: 1,
  },
  removeBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },

  addMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 8,
  },
  addMemberIcon: {
    fontSize: 18,
    fontWeight: '700',
  },
  addMemberText: {
    fontWeight: '600',
    fontSize: 14,
  },

  createBtn: {
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  disabledBtn: { opacity: 0.5 },
  createBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.3,
  },

  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  budgetPrefix: {
    fontSize: 20,
    fontWeight: '800',
    marginRight: 8,
  },
  budgetInput: {
    flex: 1,
  },
  budgetHint: {
    fontSize: 11,
    marginTop: 8,
    lineHeight: 16,
  },
});
