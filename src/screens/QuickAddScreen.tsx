/**
 * Quick Add Screen
 *
 * Minimal expense entry screen designed for speed:
 * - Enter amount + optional description
 * - Done in 3 seconds
 * - Can be launched from:
 *   - Home screen widget (via deep link: trackk://quick-add)
 *   - Lock screen widget
 *   - Notification action
 *   - App shortcut
 *
 * This is the "Offline Quick Add Widget" concept.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { useTracker } from '../store/TrackerContext';
import { useTheme } from '../store/ThemeContext';
import { saveTransaction } from '../services/StorageService';
import { ingestTransaction } from '../services/TransactionSignalEngine';
import { ParsedTransaction } from '../models/types';
import { formatCurrency } from '../utils/helpers';
import { hapticLight, hapticMedium } from '../utils/haptics';
import SuccessOverlay from '../components/SuccessOverlay';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const QUICK_CATEGORIES = [
  { label: 'Food', icon: '🍕' },
  { label: 'Cab', icon: '🚕' },
  { label: 'Shopping', icon: '🛍️' },
  { label: 'Bills', icon: '📱' },
  { label: 'Groceries', icon: '🛒' },
  { label: 'Other', icon: '📝' },
];

interface QuickAddScreenProps {
  initialAmount?: number;
  initialDescription?: string;
}

export default function QuickAddScreen({ initialAmount, initialDescription }: QuickAddScreenProps) {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { trackerState } = useTracker();
  const { colors } = useTheme();
  const amountRef = useRef<TextInput>(null);

  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : '');
  const [description, setDescription] = useState(initialDescription || '');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    // Auto-focus amount input
    setTimeout(() => amountRef.current?.focus(), 100);
  }, []);

  const handleCategoryTap = (label: string) => {
    hapticLight();
    setSelectedCategory(label);
    if (!description) setDescription(label);
  };

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      Alert.alert('Enter Amount', 'Please enter a valid amount.');
      return;
    }

    hapticMedium();
    setSaving(true);

    try {
      const desc = description.trim() || selectedCategory || 'Quick expense';
      const parsed: ParsedTransaction = {
        amount: numAmount,
        type: 'debit',
        merchant: desc,
        rawMessage: `Quick add: ${desc} - ${numAmount}`,
        timestamp: Date.now(),
      };

      // Feed through Signal Engine
      ingestTransaction(parsed, 'widget');

      // Save to personal tracker by default
      const trackerType = trackerState.reimbursement ? 'reimbursement' : 'personal';
      await saveTransaction(parsed, trackerType, user?.id || '');

      setShowSuccess(true);
      setTimeout(() => {
        nav.goBack();
      }, 1200);
    } catch {
      Alert.alert('Error', 'Failed to save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerIconWrap, { backgroundColor: `${colors.primary}15` }]}>
            <Text style={[styles.headerIcon, { color: colors.primary }]}>+</Text>
          </View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Quick Add</Text>
        </View>

        {/* Amount Input */}
        <View style={styles.amountContainer}>
          <Text style={[styles.currencySymbol, { color: colors.primary }]}>₹</Text>
          <TextInput
            ref={amountRef}
            style={[styles.amountInput, { color: colors.text }]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={colors.textLight}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
        </View>

        {/* Quick Categories */}
        <View style={styles.categoryGrid}>
          {QUICK_CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.label}
              style={[
                styles.categoryChip,
                { backgroundColor: colors.surface, borderColor: colors.border },
                selectedCategory === cat.label && { borderColor: colors.primary, backgroundColor: `${colors.primary}10` },
              ]}
              onPress={() => handleCategoryTap(cat.label)}
              activeOpacity={0.7}
            >
              <Text style={styles.categoryIcon}>{cat.icon}</Text>
              <Text style={[
                styles.categoryLabel,
                { color: colors.textSecondary },
                selectedCategory === cat.label && { color: colors.primary },
              ]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Description Input */}
        <TextInput
          style={[styles.descInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          value={description}
          onChangeText={(t) => { setDescription(t); setSelectedCategory(null); }}
          placeholder="What was this for? (optional)"
          placeholderTextColor={colors.textLight}
          maxLength={100}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>
            {saving ? 'Saving...' : amount ? `Save ${formatCurrency(parseFloat(amount) || 0)}` : 'Save Expense'}
          </Text>
        </TouchableOpacity>

        {/* Cancel */}
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => nav.goBack()}
          activeOpacity={0.7}
        >
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <SuccessOverlay
        visible={showSuccess}
        message="Expense Saved"
        subMessage={`${formatCurrency(parseFloat(amount) || 0)} added`}
        onDone={() => setShowSuccess(false)}
        color={colors.primary}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 24,
    fontWeight: '800',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
  },

  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  currencySymbol: {
    fontSize: 36,
    fontWeight: '800',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: '800',
    minWidth: 80,
    textAlign: 'center',
  },

  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 20,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  categoryIcon: { fontSize: 16 },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  descInput: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 14,
    borderWidth: 1,
    marginBottom: 24,
    textAlign: 'center',
  },

  saveBtn: {
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
