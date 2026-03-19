import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { useTheme } from '../store/ThemeContext';
import { GroupMember, Split } from '../models/types';
import { getGroup as getGroupLocal } from '../services/StorageService';
import { getGroupCloud, addGroupTransactionCloud } from '../services/SyncService';
import { addGroupTransaction } from '../services/StorageService';
import { generateId, formatCurrency, getColorForId } from '../utils/helpers';
import { GROUP_CATEGORIES } from '../utils/categories';
import { CURRENCIES, getPreferredCurrency, getCurrencyInfo } from '../utils/currencies';

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
  const { colors } = useTheme();

  const { groupId, amount: paramAmount, description: paramDesc, merchant: paramMerchant, isManual } = route.params;

  // State
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [amount, setAmount] = useState(paramAmount ? String(paramAmount) : '');
  const [note, setNote] = useState(paramDesc || '');
  const [expenseNote, setExpenseNote] = useState('');
  const [category, setCategory] = useState('');
  const [expenseCurrency, setExpenseCurrency] = useState(getPreferredCurrency());
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [splitMode, setSplitMode] = useState<'equal' | 'amount'>('equal');
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState('');

  const savingRef = useRef(false); // ref guard against double-tap race

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

    if (savingRef.current) return; // prevent double-tap race
    savingRef.current = true;
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
      if (category) {
        txn.category = category;
      }
      if (expenseNote.trim()) {
        txn.note = expenseNote.trim();
      }
      if (expenseCurrency !== 'INR') {
        txn.currency = expenseCurrency;
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
      savingRef.current = false;
      setSaving(false);
    }
  };

  const tagOptions = members.filter(m => !m.isGuest && m.included);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Group badge */}
          <View style={[styles.groupBadge, { backgroundColor: `${colors.groupColor}10`, borderColor: `${colors.groupColor}30` }]}>
            <Text style={[styles.groupBadgeText, { color: colors.groupColor }]}>{groupName}</Text>
          </View>

          {/* Amount input (only for manual entry) */}
          {isManual ? (
            <View style={styles.section}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>AMOUNT</Text>
                <TouchableOpacity
                  style={[styles.currencyBadge, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
                  onPress={() => setShowCurrencyPicker(!showCurrencyPicker)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.currencyBadgeText, { color: colors.textSecondary }]}>
                    {getCurrencyInfo(expenseCurrency).flag} {expenseCurrency}
                  </Text>
                </TouchableOpacity>
              </View>
              {showCurrencyPicker && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  {CURRENCIES.slice(0, 15).map(curr => (
                    <TouchableOpacity
                      key={curr.code}
                      style={[styles.categoryChip, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }, expenseCurrency === curr.code && { borderColor: colors.primary, backgroundColor: `${colors.primary}10` }]}
                      onPress={() => { setExpenseCurrency(curr.code); setShowCurrencyPicker(false); }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.categoryChipIcon}>{curr.flag}</Text>
                      <Text style={[styles.categoryChipText, { color: colors.textSecondary }, expenseCurrency === curr.code && { color: colors.primary }]}>
                        {curr.code}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <View style={[styles.amountRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.amountPrefix, { color: colors.primary }]}>{getCurrencyInfo(expenseCurrency).symbol}</Text>
                <TextInput
                  style={[styles.amountInput, { color: colors.text }]}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textLight}
                  autoFocus
                />
              </View>
            </View>
          ) : (
            <View style={styles.amountDisplay}>
              <Text style={[styles.amountDisplayLabel, { color: colors.textSecondary }]}>AMOUNT</Text>
              <Text style={[styles.amountDisplayValue, { color: colors.primary }]}>{formatCurrency(parsedAmount)}</Text>
              {paramMerchant && (
                <Text style={[styles.amountDisplayMerchant, { color: colors.textSecondary }]}>{paramMerchant}</Text>
              )}
            </View>
          )}

          {/* Note / Description */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {isManual ? 'DESCRIPTION' : 'ADD A NOTE'}
            </Text>
            <TextInput
              style={[styles.noteInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={note}
              onChangeText={setNote}
              placeholder={isManual ? 'e.g. Dinner at BBQ Nation, Groceries...' : 'e.g. Ordered for Rahul too, Cash payment...'}
              placeholderTextColor={colors.textLight}
              multiline
              maxLength={200}
            />
          </View>

          {/* Category quick-pick */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {GROUP_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.label}
                  style={[styles.categoryChip, { backgroundColor: colors.surface, borderColor: colors.border }, category === cat.label && { borderColor: colors.primary, backgroundColor: `${colors.primary}10` }]}
                  onPress={() => setCategory(category === cat.label ? '' : cat.label)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryChipIcon}>{cat.icon}</Text>
                  <Text style={[styles.categoryChipText, { color: colors.textSecondary }, category === cat.label && { color: colors.primary }]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Expense note */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>NOTE (OPTIONAL)</Text>
            <TextInput
              style={[styles.noteInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={expenseNote}
              onChangeText={setExpenseNote}
              placeholder="Add a note for context..."
              placeholderTextColor={colors.textLight}
              multiline
              maxLength={300}
            />
          </View>

          {/* Split mode toggle */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>SPLIT TYPE</Text>
            <View style={[styles.modeRow, { backgroundColor: colors.surfaceHigh }]}>
              <TouchableOpacity
                style={[styles.modeBtn, splitMode === 'equal' && { backgroundColor: colors.primary }]}
                onPress={() => setSplitMode('equal')}
                activeOpacity={0.7}
              >
                <Text style={[styles.modeBtnText, { color: colors.textSecondary }, splitMode === 'equal' && { color: '#FFFFFF' }]}>
                  Equal
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, splitMode === 'amount' && { backgroundColor: colors.primary }]}
                onPress={() => setSplitMode('amount')}
                activeOpacity={0.7}
              >
                <Text style={[styles.modeBtnText, { color: colors.textSecondary }, splitMode === 'amount' && { color: '#FFFFFF' }]}>
                  By Amount
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Member selection */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>WHO'S IN?</Text>
            <Text style={[styles.sublabel, { color: colors.textSecondary }]}>
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
                <View key={m.userId} style={[styles.memberRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {/* Checkbox */}
                  <TouchableOpacity
                    style={[
                      styles.checkbox,
                      { borderColor: colors.border },
                      m.included && { borderColor: color, backgroundColor: `${color}15` },
                    ]}
                    onPress={() => m.isGuest ? removeGuest(m.userId) : toggleMember(m.userId)}
                    activeOpacity={0.7}
                  >
                    {m.included && <Text style={[styles.checkmark, { color }]}>✓</Text>}
                  </TouchableOpacity>

                  {/* Avatar + Name */}
                  <View style={[styles.memberAvatar, { backgroundColor: `${color}15` }]}>
                    <Text style={[styles.memberInitial, { color }]}>
                      {m.displayName[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={[
                      styles.memberName,
                      { color: colors.text },
                      !m.included && { color: colors.textSecondary, textDecorationLine: 'line-through' },
                    ]}>
                      {m.displayName}
                    </Text>
                    {m.isGuest && taggedMember && (
                      <Text style={[styles.guestTag, { color: colors.textSecondary }]}>
                        Guest · tagged to {taggedMember.displayName}
                      </Text>
                    )}
                    {m.isGuest && (
                      <TouchableOpacity onPress={() => removeGuest(m.userId)}>
                        <Text style={[styles.removeGuestText, { color: colors.danger }]}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Custom amount input (By Amount mode) */}
                  {splitMode === 'amount' && m.included && (
                    <View style={[styles.customAmountWrap, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
                      <Text style={[styles.customAmountPrefix, { color: colors.primary }]}>{getCurrencyInfo(expenseCurrency).symbol}</Text>
                      <TextInput
                        style={[styles.customAmountInput, { color: colors.text }]}
                        value={m.customAmount}
                        onChangeText={v => updateCustomAmount(m.userId, v)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.textLight}
                      />
                    </View>
                  )}

                  {/* Equal amount display */}
                  {splitMode === 'equal' && m.included && parsedAmount > 0 && (
                    <Text style={[styles.equalAmount, { color: colors.textSecondary }]}>{formatCurrency(getEqualSplit())}</Text>
                  )}
                </View>
              );
            })}

            {/* Validation message for By Amount */}
            {splitMode === 'amount' && parsedAmount > 0 && (
              <View style={[
                styles.validationRow,
                Math.abs(customDiff) < 0.01
                  ? { borderColor: `${colors.success}40` }
                  : { borderColor: `${colors.danger}40` },
              ]}>
                <Text style={[
                  styles.validationText,
                  Math.abs(customDiff) < 0.01
                    ? { color: colors.success }
                    : { color: colors.danger },
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
              style={[styles.addGuestBtn, { borderColor: `${colors.primary}40` }]}
              onPress={() => setShowGuestInput(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.addGuestIcon, { color: colors.primary }]}>+</Text>
              <Text style={[styles.addGuestText, { color: colors.primary }]}>Add a guest</Text>
              <Text style={[styles.addGuestHint, { color: colors.textSecondary }]}>One-time, tagged to a member</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.guestInputCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>ADD GUEST</Text>
              <TextInput
                style={[styles.guestNameInput, { backgroundColor: colors.surfaceHigh, borderColor: colors.border, color: colors.text }]}
                value={guestName}
                onChangeText={setGuestName}
                placeholder="Guest's name"
                placeholderTextColor={colors.textLight}
                autoFocus
              />
              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>TAGGED TO</Text>
              <Text style={[styles.sublabel, { color: colors.textSecondary }]}>
                Their share goes to this member's tab
              </Text>
              <View style={styles.tagOptions}>
                {tagOptions.map(m => (
                  <TouchableOpacity
                    key={m.userId}
                    style={[
                      styles.tagChip,
                      { backgroundColor: colors.surfaceHigh, borderColor: colors.border },
                      guestTaggedTo === m.userId && { borderColor: colors.primary, backgroundColor: `${colors.primary}10` },
                    ]}
                    onPress={() => setGuestTaggedTo(m.userId)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.tagChipText,
                      { color: colors.textSecondary },
                      guestTaggedTo === m.userId && { color: colors.primary },
                    ]}>
                      {m.displayName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.guestBtnRow}>
                <TouchableOpacity
                  style={[styles.guestCancelBtn, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
                  onPress={() => { setShowGuestInput(false); setGuestName(''); setGuestTaggedTo(''); }}
                >
                  <Text style={[styles.guestCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.guestConfirmBtn, { backgroundColor: colors.primary }]} onPress={addGuest}>
                  <Text style={styles.guestConfirmText}>Add Guest</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom save button */}
        <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={styles.bottomInfo}>
            <Text style={[styles.bottomTotal, { color: colors.primary }]}>{formatCurrency(parsedAmount)}</Text>
            <Text style={[styles.bottomSplit, { color: colors.textSecondary }]}>
              split {includedMembers.length} ways
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.5 }]}
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
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },

  groupBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  groupBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  section: { marginBottom: 20 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  sublabel: {
    fontSize: 12,
    marginBottom: 12,
    marginTop: -4,
  },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  amountPrefix: {
    fontSize: 24,
    fontWeight: '800',
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    paddingVertical: 14,
  },
  amountDisplay: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 8,
  },
  amountDisplayLabel: {
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 6,
  },
  amountDisplayValue: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  amountDisplayMerchant: {
    fontSize: 13,
    marginTop: 4,
  },

  noteInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    minHeight: 48,
    textAlignVertical: 'top',
  },

  currencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  currencyBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  categoryScroll: {
    marginHorizontal: -4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryChipIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
  },

  modeRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  checkbox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
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
  },
  guestTag: {
    fontSize: 10,
    marginTop: 2,
  },
  removeGuestText: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },

  customAmountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    width: 100,
  },
  customAmountPrefix: {
    fontSize: 14,
    fontWeight: '700',
  },
  customAmountInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  equalAmount: {
    fontSize: 13,
    fontWeight: '700',
  },

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

  addGuestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  addGuestIcon: {
    fontSize: 18,
    fontWeight: '700',
    marginRight: 10,
  },
  addGuestText: {
    fontSize: 14,
    fontWeight: '600',
  },
  addGuestHint: {
    fontSize: 11,
    marginLeft: 8,
  },

  guestInputCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  guestNameInput: {
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    borderWidth: 1,
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
    borderWidth: 1,
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: '600',
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
    alignItems: 'center',
    borderWidth: 1,
  },
  guestCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  guestConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  guestConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  bottomInfo: { flex: 1 },
  bottomTotal: {
    fontSize: 18,
    fontWeight: '800',
  },
  bottomSplit: {
    fontSize: 12,
    marginTop: 2,
  },
  saveBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
