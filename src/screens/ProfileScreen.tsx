import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../store/AuthContext';
import { clearAllData } from '../services/StorageService';
import { COLORS } from '../utils/helpers';

export default function ProfileScreen() {
  const { user, updateProfile } = useAuth();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(user?.displayName || '');

  const initial = (user?.displayName || 'U').charAt(0).toUpperCase();
  const avatarColor = user?.avatarColor || COLORS.personalColor;

  const handleSaveName = async () => {
    const trimmed = editName.trim();
    if (trimmed.length === 0) {
      setEditName(user?.displayName || '');
      setIsEditingName(false);
      return;
    }
    await updateProfile(trimmed, user?.phone || '');
    setIsEditingName(false);
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all your transactions, groups, goals, and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Alert.alert('Done', 'All data has been cleared. Please restart the app.');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={['#1C1708', '#0E0C04', COLORS.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerCard}
        >
          <View style={styles.headerGoldLine} />

          {/* Avatar */}
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>

          {/* Display Name */}
          {isEditingName ? (
            <View style={styles.editNameRow}>
              <TextInput
                style={styles.nameInput}
                value={editName}
                onChangeText={setEditName}
                autoFocus
                maxLength={30}
                placeholderTextColor={COLORS.textSecondary}
                selectionColor={COLORS.primary}
                onSubmitEditing={handleSaveName}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveName}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => {
                setEditName(user?.displayName || '');
                setIsEditingName(true);
              }}
              style={styles.nameRow}
            >
              <Text style={styles.displayName}>{user?.displayName || 'User'}</Text>
              <Text style={styles.editHint}>tap to edit</Text>
            </TouchableOpacity>
          )}

          {/* Phone */}
          {user?.phone ? (
            <View style={styles.phoneRow}>
              <Text style={styles.phoneIcon}>📱</Text>
              <Text style={styles.phoneText}>{user.phone}</Text>
            </View>
          ) : null}
        </LinearGradient>

        {/* Privacy & Data Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>PRIVACY & DATA</Text>
        </View>

        <View style={styles.privacyCard}>
          <View style={styles.privacyHeader}>
            <View style={styles.shieldIcon}>
              <Text style={styles.shieldEmoji}>🛡️</Text>
            </View>
            <Text style={styles.privacyTitle}>Your data is safe</Text>
          </View>
          <View style={styles.privacyDivider} />
          <Text style={styles.privacyText}>
            Trackk uses event-driven SMS detection — it only wakes up when a
            new bank SMS arrives. No background polling, no battery drain. You
            can switch off tracking anytime.
          </Text>
          <View style={styles.privacyBadgeRow}>
            <View style={styles.privacyBadge}>
              <Text style={styles.privacyBadgeText}>Low Battery Usage</Text>
            </View>
            <View style={styles.privacyBadge}>
              <Text style={styles.privacyBadgeText}>SMS Only When Active</Text>
            </View>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ABOUT</Text>
        </View>

        <View style={styles.aboutCard}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={styles.aboutDivider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Storage</Text>
            <Text style={styles.aboutValue}>All data stored locally on your device</Text>
          </View>
        </View>

        {/* Clear Data */}
        <TouchableOpacity style={styles.clearBtn} onPress={handleClearData}>
          <Text style={styles.clearBtnText}>Clear All Data</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },

  /* ── Header Card ────────────────────────────────────────────── */
  headerCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  headerGoldLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  /* ── Avatar ─────────────────────────────────────────────────── */
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: `${COLORS.primary}40`,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* ── Name ────────────────────────────────────────────────────── */
  nameRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  displayName: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  editHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  nameInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.background,
  },

  /* ── Phone ───────────────────────────────────────────────────── */
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  phoneIcon: {
    fontSize: 14,
  },
  phoneText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },

  /* ── Section Headers ─────────────────────────────────────────── */
  sectionHeader: {
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  /* ── Privacy Card ────────────────────────────────────────────── */
  privacyCard: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  shieldIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${COLORS.success}18`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.success}30`,
  },
  shieldEmoji: {
    fontSize: 20,
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.success,
  },
  privacyDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 12,
  },
  privacyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  privacyBadgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  privacyBadge: {
    backgroundColor: `${COLORS.success}15`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${COLORS.success}25`,
  },
  privacyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
    letterSpacing: 0.5,
  },

  /* ── About Card ──────────────────────────────────────────────── */
  aboutCard: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  aboutLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  aboutValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: '60%',
  },
  aboutDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },

  /* ── Clear Data Button ───────────────────────────────────────── */
  clearBtn: {
    backgroundColor: `${COLORS.danger}15`,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.danger}30`,
  },
  clearBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.danger,
    letterSpacing: 0.3,
  },
});
