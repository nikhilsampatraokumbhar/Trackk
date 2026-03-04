import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../store/AuthContext';
import { useGoals } from '../store/GoalsContext';
import { FinancialProfile } from '../models/types';
import { COLORS, formatCurrency } from '../utils/helpers';

function AvatarCircle({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials || '?'}</Text>
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

function FieldRow({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  editable = true,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  editable?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, !editable && styles.fieldInputReadonly]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        editable={editable}
        placeholder={placeholder ?? '—'}
        placeholderTextColor={COLORS.textLight}
      />
    </View>
  );
}

export function ProfileScreen() {
  const { user, updateProfile, signOut } = useAuth();
  const { profile, saveProfile, monthlySavings } = useGoals();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  // Financial profile fields as strings for TextInput
  const [salary, setSalary] = useState(String(profile?.salary ?? ''));
  const [emi, setEmi] = useState(String(profile?.emiTotal ?? ''));
  const [fixed, setFixed] = useState(String(profile?.fixedExpenses ?? ''));
  const [maintenance, setMaintenance] = useState(String(profile?.maintenanceAvg ?? ''));
  const [misc, setMisc] = useState(String(profile?.miscAvg ?? ''));

  const computedSavings = (() => {
    const s = parseFloat(salary) || 0;
    const e = parseFloat(emi) || 0;
    const f = parseFloat(fixed) || 0;
    const m = parseFloat(maintenance) || 0;
    const x = parseFloat(misc) || 0;
    return s - e - f - m - x;
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      if (displayName.trim() && displayName.trim() !== user?.displayName) {
        await updateProfile({ displayName: displayName.trim() });
      }

      const fp: FinancialProfile = {
        salary: parseFloat(salary) || 0,
        emiTotal: parseFloat(emi) || 0,
        fixedExpenses: parseFloat(fixed) || 0,
        maintenanceAvg: parseFloat(maintenance) || 0,
        miscAvg: parseFloat(misc) || 0,
      };
      await saveProfile(fp);
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch {
      Alert.alert('Error', 'Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Avatar + identity ─────────────────────────────── */}
        <View style={styles.avatarSection}>
          <AvatarCircle name={displayName || user?.displayName || '?'} />
          <Text style={styles.phoneBadge}>{user?.phone ?? '—'}</Text>
        </View>

        {/* ── Personal info ─────────────────────────────────── */}
        <View style={styles.card}>
          <SectionHeader label="PERSONAL INFO" />
          <FieldRow
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
          />
          <FieldRow
            label="Phone"
            value={user?.phone ?? ''}
            editable={false}
            keyboardType="phone-pad"
          />
        </View>

        {/* ── Financial profile ─────────────────────────────── */}
        <View style={styles.card}>
          <SectionHeader label="FINANCIAL PROFILE" />
          <Text style={styles.cardSubtitle}>
            Used by Goals to calculate your daily spending budget.
          </Text>
          <FieldRow
            label="Monthly salary (₹)"
            value={salary}
            onChangeText={setSalary}
            keyboardType="numeric"
            placeholder="0"
          />
          <FieldRow
            label="EMIs (₹/mo)"
            value={emi}
            onChangeText={setEmi}
            keyboardType="numeric"
            placeholder="0"
          />
          <FieldRow
            label="Fixed expenses (₹/mo)"
            value={fixed}
            onChangeText={setFixed}
            keyboardType="numeric"
            placeholder="Rent, utilities, groceries"
          />
          <FieldRow
            label="Maintenance avg (₹/mo)"
            value={maintenance}
            onChangeText={setMaintenance}
            keyboardType="numeric"
            placeholder="Vehicle, repairs"
          />
          <FieldRow
            label="Misc avg (₹/mo)"
            value={misc}
            onChangeText={setMisc}
            keyboardType="numeric"
            placeholder="Everything else"
          />

          {/* Computed savings preview */}
          <View style={styles.savingsRow}>
            <Text style={styles.savingsLabel}>Monthly savings potential</Text>
            <Text
              style={[
                styles.savingsValue,
                { color: computedSavings >= 0 ? COLORS.success : COLORS.danger },
              ]}>
              {formatCurrency(computedSavings)}
            </Text>
          </View>
        </View>

        {/* ── Save ──────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>{saving ? 'SAVING…' : 'SAVE CHANGES'}</Text>
        </TouchableOpacity>

        {/* ── Sign out ──────────────────────────────────────── */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.75}>
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 48 },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 28, marginTop: 8 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  phoneBadge: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },

  // Cards
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionHeader: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginBottom: 12,
  },
  cardSubtitle: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: -6,
    marginBottom: 12,
    lineHeight: 16,
  },

  // Fields
  fieldRow: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 5,
  },
  fieldInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  fieldInputReadonly: {
    color: COLORS.textSecondary,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },

  // Savings preview row
  savingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  savingsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  savingsValue: { fontSize: 16, fontWeight: '800' },

  // Buttons
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 4,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1.5 },

  signOutBtn: {
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.danger + '50',
    borderRadius: 4,
  },
  signOutText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
    letterSpacing: 1.5,
  },
});
