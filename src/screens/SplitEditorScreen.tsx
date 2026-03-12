import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { useGroups } from '../store/GroupContext';
import { GroupMember, Split } from '../models/types';
import { getGroup as getGroupLocal } from '../services/StorageService';
import { getGroupCloud, addGroupTransactionCloud } from '../services/SyncService';
import { addGroupTransaction } from '../services/StorageService';
import { generateId, COLORS, formatCurrency, getColorForId } from '../utils/helpers';

type Route = RouteProp<RootStackParamList, 'SplitEditor'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

interface MemberEntry {
  userId: string;
  displayName: string;
  phone: string;
  included: boolean;
  customAmount: string; // string for TextInput, parsed to number on save
  isGuest: boolean;
  taggedTo?: string; // userId of group member this guest is tagged to
}

export default function SplitEditorScreen() {
  const route = useRoute<Route>();
  const nav = useNavigation<Nav>();
  const { user, isAuthenticated } = useAuth();
  const { loadGroupTransactions, activeGroupId } = useGroups();

  const { groupId, amount: paramAmount, description: paramDesc, merchant: paramMerchant, isManual } = route.params;

  // State
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [amount, setAmount] = useState(paramAmount ? String(paramAmount) : '');
  const [note, setNote] = useState(paramDesc || '');
  const [splitMode, setSplitMode] = useState<'equal' | 'amount'>('equal');
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState('');

  // Guest add state
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestTaggedTo, setGuestTaggedTo] = useState('');

  const userId = user?.id || '';

  // Load group members
  useEffect(() => {
    (async () => {
      let group = await getGroupLocal(groupId);
      if (!group && isAuthenticated) {
        try { group = await getGroupCloud(groupId); } catch {}
      }
      if (!group) {
        Alert.alert('Error', 'Group not found');
        nav.goBack();
        return;
      }
      setGroupName(group.name);
      setMembers(group.members.map(m => ({
        userId: m.userId,
        displayName: m.userId === userId ? 'You' : m.displayName,
        phone: m.phone,
        included: true,
        customAmount: '',
        isGuest: false,
      })));
    })();
  }, [groupId]);

  const includedMembers = members.filter(m => m.included);
  const parsedAmount = parseFloat(amount) || 0;

  // Calculate split amounts
  const getEqualSplit = () => {
    if (includedMembers.length === 0 || parsedAmount <= 0) return 0;
    return Math.round((parsedAmount / includedMembers.length) * 100) / 100;
  };

  const getCustomTotal = () => {
    return includedMembers.reduce((sum, m) => sum + (parseFloat(m.customAmount) || 0), 0);
  };

  const customDiff = splitMode === 'amount'
    ? Math.round((parsedAmount - getCustomTotal()) * 100) / 100
    : 0;

  // Toggle member inclusion
  const toggleMember = (userId: string) => {
    setMembers(prev => prev.map(m =>
      m.userId === userId ? { ...m, included: !m.included } : m,
    ));
  };

  // Update custom amount for a member
  const updateCustomAmount = (userId: string, val: string) => {
    setMembers(prev => prev.map(m =>
      m.userId === userId ? { ...m, customAmount: val } : m,
    ));
  };

  // Add guest
  const addGuest = () => {
    if (!guestName.trim()) {
      Alert.alert('Enter name', 'Please enter the guest\'s name');
      return;
    }
    if (!guestTaggedTo) {
      Alert.alert('Tag to member', 'Please select which member this guest is tagged to');
      return;
    }
    const guest: MemberEntry = {
      userId: `guest_${generateId()}`,
      displayName: guestName.trim(),
      phone: '',
      included: true,
      customAmount: '',
      isGuest: true,
      taggedTo: guestTaggedTo,
    };
    setMembers(prev => [...prev, guest]);
    setGuestName('');
    setGuestTaggedTo('');
    setShowGuestInput(false);
  };

  // Remove guest
  const removeGuest = (guestId: string) => {
    setMembers(prev => prev.filter(m => m.userId !== guestId));
  };

  // Save the expense
  const handleSave = async () => {
    if (parsedAmount <= 0) {
      Alert.alert('Enter amount', 'Please enter a valid amount');
      return;
    }
    if (includedMembers.length < 2) {
      Alert.alert('Need members', 'At least 2 people must be in the split');
      return;
    }
    if (splitMode === 'amount' && Math.abs(customDiff) > 0.01) {
      Alert.alert(
        'Amounts don\'t match',
        `Individual amounts must add up to ${formatCurrency(parsedAmount)}. Currently off by ${formatCurrency(Math.abs(customDiff))}.`,
      );
      return;
    }

    setSaving(true);

    try {
      // Build splits
      const equalAmount = getEqualSplit();
      const totalFromEqual = equalAmount * includedMembers.length;
      const roundingDiff = Math.round((parsedAmount - totalFromEqual) * 100) / 100;

      // For guests tagged to a member, merge their share into the tagged member
      const guestShares: Record<string, number> = {}; // taggedTo userId → total guest amounts
      const nonGuestIncluded = includedMembers.filter(m => !m.isGuest);
      const guestIncluded = includedMembers.filter(m => m.isGuest);

      // Calculate each person's amount
      let splits: Split[] = [];

      if (splitMode === 'equal') {
        // Equal split among all included (including guests as separate entries first)
        const allIncluded = includedMembers;
        const perPerson = Math.round((parsedAmount / allIncluded.length) * 100) / 100;
        const totalSplits = perPerson * allIncluded.length;
        const diff = Math.round((parsedAmount - totalSplits) * 100) / 100;

        // Aggregate guest amounts to their tagged member
        for (const guest of guestIncluded) {
          if (guest.taggedTo) {
            guestShares[guest.taggedTo] = (guestShares[guest.taggedTo] || 0) + perPerson;
          }
        }

        splits = nonGuestIncluded.map((m, i) => {
          let amt = perPerson + (guestShares[m.userId] || 0);
          // Last non-guest member absorbs rounding
          if (i === nonGuestIncluded.length - 1) {
            amt += diff;
          }
          return {
            userId: m.userId,
            displayName: m.displayName,
            amount: Math.round(amt * 100) / 100,
            settled: m.userId === userId,
          };
        });
      } else {
        // Custom amounts
        // Aggregate guest custom amounts to tagged member
        for (const guest of guestIncluded) {
          if (guest.taggedTo) {
            const guestAmt = parseFloat(guest.customAmount) || 0;
            guestShares[guest.taggedTo] = (guestShares[guest.taggedTo] || 0) + guestAmt;
          }
        }

        splits = nonGuestIncluded.map(m => ({
          userId: m.userId,
          displayName: m.displayName,
          amount: Math.round(((parseFloat(m.customAmount) || 0) + (guestShares[m.userId] || 0)) * 100) / 100,
          settled: m.userId === userId,
        }));
      }

      // Build the description
      const desc = note.trim()
        || (paramMerchant ? `Payment at ${paramMerchant}` : 'Group expense');

      // Get full group members list for cloud function
      let group = await getGroupLocal(groupId);
      if (!group && isAuthenticated) {
        try { group = await getGroupCloud(groupId); } catch {}
      }

      // Save with custom splits directly
      // Note: Firestore rejects `undefined` values, so we conditionally include optional fields
      const txn: Record<string, any> = {
        id: generateId(),
        groupId,
        addedBy: userId,
        amount: parsedAmount,
        description: desc,
        timestamp: Date.now(),
        splits,
      };
      if (paramMerchant) {
        txn.merchant = paramMerchant;
      }

      if (isAuthenticated) {
        const { db } = require('../services/FirebaseConfig');
        await db.groupTransaction(groupId, txn.id).set(txn);
      } else {
        // Save to local storage
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const key = `@et_group_txns_${groupId}`;
        const raw = await AsyncStorage.getItem(key);
        const all = raw ? JSON.parse(raw) : [];
        all.unshift(txn);
        await AsyncStorage.setItem(key, JSON.stringify(all));
      }

      // Refresh group transactions in context
      if (activeGroupId === groupId) {
        loadGroupTransactions(groupId);
      }

      // Navigate to the group detail screen so user can see the expense
      nav.replace('GroupDetail', { groupId });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const tagOptions = members.filter(m => !m.isGuest && m.included);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Group badge */}
          <View style={styles.groupBadge}>
            <Text style={styles.groupBadgeText}>{groupName}</Text>
          </View>

          {/* Amount input (only for manual entry) */}
          {isManual ? (
            <View style={styles.section}>
              <Text style={styles.label}>AMOUNT</Text>
              <View style={styles.amountRow}>
                <Text style={styles.amountPrefix}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={COLORS.textLight}
                  autoFocus
                />
              </View>
            </View>
          ) : (
            <View style={styles.amountDisplay}>
              <Text style={styles.amountDisplayLabel}>AMOUNT</Text>
              <Text style={styles.amountDisplayValue}>{formatCurrency(parsedAmount)}</Text>
              {paramMerchant && (
                <Text style={styles.amountDisplayMerchant}>{paramMerchant}</Text>
              )}
            </View>
          )}

          {/* Note / Description */}
          <View style={styles.section}>
            <Text style={styles.label}>
              {isManual ? 'DESCRIPTION' : 'ADD A NOTE'}
            </Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder={isManual ? 'e.g. Dinner at BBQ Nation, Groceries...' : 'e.g. Ordered for Rahul too, Cash payment...'}
              placeholderTextColor={COLORS.textLight}
              multiline
              maxLength={200}
            />
          </View>

          {/* Split mode toggle */}
          <View style={styles.section}>
            <Text style={styles.label}>SPLIT TYPE</Text>
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn, splitMode === 'equal' && styles.modeBtnActive]}
                onPress={() => setSplitMode('equal')}
                activeOpacity={0.7}
              >
                <Text style={[styles.modeBtnText, splitMode === 'equal' && styles.modeBtnTextActive]}>
                  Equal
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, splitMode === 'amount' && styles.modeBtnActive]}
                onPress={() => setSplitMode('amount')}
                activeOpacity={0.7}
              >
                <Text style={[styles.modeBtnText, splitMode === 'amount' && styles.modeBtnTextActive]}>
                  By Amount
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Member selection */}
          <View style={styles.section}>
            <Text style={styles.label}>WHO'S IN?</Text>
            <Text style={styles.sublabel}>
              {includedMembers.length} of {members.length} selected
              {splitMode === 'equal' && parsedAmount > 0 && includedMembers.length > 0
                ? ` · ${formatCurrency(getEqualSplit())} each`
                : ''}
            </Text>

            {members.map(m => {
              const color = getColorForId(m.userId);
              const taggedMember = m.isGuest && m.taggedTo
                ? members.find(mem => mem.userId === m.taggedTo)
                : null;

              return (
                <View key={m.userId} style={styles.memberRow}>
                  {/* Checkbox */}
                  <TouchableOpacity
                    style={[
                      styles.checkbox,
                      m.included && styles.checkboxActive,
                      m.included && { borderColor: color, backgroundColor: `${color}20` },
                    ]}
                    onPress={() => m.isGuest ? removeGuest(m.userId) : toggleMember(m.userId)}
                    activeOpacity={0.7}
                  >
                    {m.included && <Text style={[styles.checkmark, { color }]}>✓</Text>}
                  </TouchableOpacity>

                  {/* Avatar + Name */}
                  <View style={[styles.memberAvatar, { backgroundColor: `${color}20` }]}>
                    <Text style={[styles.memberInitial, { color }]}>
                      {m.displayName[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={[
                      styles.memberName,
                      !m.included && styles.memberNameDisabled,
                    ]}>
                      {m.displayName}
                    </Text>
                    {m.isGuest && taggedMember && (
                      <Text style={styles.guestTag}>
                        Guest · tagged to {taggedMember.displayName}
                      </Text>
                    )}
                    {m.isGuest && (
                      <TouchableOpacity onPress={() => removeGuest(m.userId)}>
                        <Text style={styles.removeGuestText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Custom amount input (By Amount mode) */}
                  {splitMode === 'amount' && m.included && !m.isGuest && (
                    <View style={styles.customAmountWrap}>
                      <Text style={styles.customAmountPrefix}>₹</Text>
                      <TextInput
                        style={styles.customAmountInput}
                        value={m.customAmount}
                        onChangeText={v => updateCustomAmount(m.userId, v)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={COLORS.textLight}
                      />
                    </View>
                  )}
                  {splitMode === 'amount' && m.included && m.isGuest && (
                    <View style={styles.customAmountWrap}>
                      <Text style={styles.customAmountPrefix}>₹</Text>
                      <TextInput
                        style={styles.customAmountInput}
                        value={m.customAmount}
                        onChangeText={v => updateCustomAmount(m.userId, v)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={COLORS.textLight}
                      />
                    </View>
                  )}

                  {/* Equal amount display */}
                  {splitMode === 'equal' && m.included && parsedAmount > 0 && (
                    <Text style={styles.equalAmount}>{formatCurrency(getEqualSplit())}</Text>
                  )}
                </View>
              );
            })}

            {/* Validation message for By Amount */}
            {splitMode === 'amount' && parsedAmount > 0 && (
              <View style={[
                styles.validationRow,
                Math.abs(customDiff) < 0.01
                  ? { borderColor: `${COLORS.success}40` }
                  : { borderColor: `${COLORS.danger}40` },
              ]}>
                <Text style={[
                  styles.validationText,
                  Math.abs(customDiff) < 0.01
                    ? { color: COLORS.success }
                    : { color: COLORS.danger },
                ]}>
                  {Math.abs(customDiff) < 0.01
                    ? 'Amounts add up correctly'
                    : `${customDiff > 0 ? 'Remaining' : 'Excess'}: ${formatCurrency(Math.abs(customDiff))}`}
                </Text>
              </View>
            )}
          </View>

          {/* Add Guest */}
          {!showGuestInput ? (
            <TouchableOpacity
              style={styles.addGuestBtn}
              onPress={() => setShowGuestInput(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.addGuestIcon}>+</Text>
              <Text style={styles.addGuestText}>Add a guest</Text>
              <Text style={styles.addGuestHint}>One-time, tagged to a member</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.guestInputCard}>
              <Text style={styles.label}>ADD GUEST</Text>
              <TextInput
                style={styles.guestNameInput}
                value={guestName}
                onChangeText={setGuestName}
                placeholder="Guest's name"
                placeholderTextColor={COLORS.textLight}
                autoFocus
              />
              <Text style={[styles.label, { marginTop: 12 }]}>TAGGED TO</Text>
              <Text style={styles.sublabel}>
                Their share goes to this member's tab
              </Text>
              <View style={styles.tagOptions}>
                {tagOptions.map(m => (
                  <TouchableOpacity
                    key={m.userId}
                    style={[
                      styles.tagChip,
                      guestTaggedTo === m.userId && styles.tagChipActive,
                    ]}
                    onPress={() => setGuestTaggedTo(m.userId)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.tagChipText,
                      guestTaggedTo === m.userId && styles.tagChipTextActive,
                    ]}>
                      {m.displayName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.guestBtnRow}>
                <TouchableOpacity
                  style={styles.guestCancelBtn}
                  onPress={() => { setShowGuestInput(false); setGuestName(''); setGuestTaggedTo(''); }}
                >
                  <Text style={styles.guestCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.guestConfirmBtn} onPress={addGuest}>
                  <Text style={styles.guestConfirmText}>Add Guest</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom save button */}
        <View style={styles.bottomBar}>
          <View style={styles.bottomInfo}>
            <Text style={styles.bottomTotal}>{formatCurrency(parsedAmount)}</Text>
            <Text style={styles.bottomSplit}>
              split {includedMembers.length} ways
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>
              {saving ? 'Saving...' : 'Confirm Split'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 32 },

  groupBadge: {
    alignSelf: 'flex-start',
    backgroundColor: `${COLORS.groupColor}15`,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${COLORS.groupColor}30`,
    marginBottom: 16,
  },
  groupBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.groupColor,
    letterSpacing: 0.3,
  },

  section: { marginBottom: 20 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  sublabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 12,
    marginTop: -4,
  },

  /* ── Amount ──────────────────────────────────────────────── */
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
  },
  amountPrefix: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    paddingVertical: 14,
  },
  amountDisplay: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 8,
  },
  amountDisplayLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginBottom: 6,
  },
  amountDisplayValue: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  amountDisplayMerchant: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  /* ── Note ──────────────────────────────────────────────── */
  noteInput: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 48,
    textAlignVertical: 'top',
  },

  /* ── Split Mode Toggle ──────────────────────────────────── */
  modeRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 12,
    padding: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  modeBtnActive: {
    backgroundColor: COLORS.primary,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  modeBtnTextActive: {
    color: COLORS.background,
  },

  /* ── Member Row ─────────────────────────────────────────── */
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  checkbox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxActive: {
    borderColor: COLORS.groupColor,
    backgroundColor: `${COLORS.groupColor}20`,
  },
  checkmark: {
    fontSize: 14,
    fontWeight: '800',
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  memberInitial: {
    fontSize: 14,
    fontWeight: '800',
  },
  memberInfo: { flex: 1 },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  memberNameDisabled: {
    color: COLORS.textSecondary,
    textDecorationLine: 'line-through',
  },
  guestTag: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  removeGuestText: {
    fontSize: 10,
    color: COLORS.danger,
    fontWeight: '700',
    marginTop: 2,
  },

  /* ── Custom Amount ──────────────────────────────────────── */
  customAmountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 100,
  },
  customAmountPrefix: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  customAmountInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  equalAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },

  /* ── Validation ─────────────────────────────────────────── */
  validationRow: {
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  validationText: {
    fontSize: 12,
    fontWeight: '700',
  },

  /* ── Add Guest ──────────────────────────────────────────── */
  addGuestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${COLORS.primary}40`,
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  addGuestIcon: {
    fontSize: 18,
    color: COLORS.primary,
    fontWeight: '700',
    marginRight: 10,
  },
  addGuestText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  addGuestHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },

  guestInputCard: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  guestNameInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}15`,
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tagChipTextActive: {
    color: COLORS.primary,
  },
  guestBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  guestCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  guestCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  guestConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  guestConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.background,
  },

  /* ── Bottom Bar ─────────────────────────────────────────── */
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  bottomInfo: { flex: 1 },
  bottomTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  bottomSplit: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.background,
    letterSpacing: 0.3,
  },
});
