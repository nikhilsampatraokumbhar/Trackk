import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getTransaction, deleteTransaction, updateTransaction } from '../services/StorageService';
import { Transaction } from '../models/types';
import { usePremium } from '../store/PremiumContext';
import { COLORS, formatCurrency, formatDate } from '../utils/helpers';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

type Route = RouteProp<RootStackParamList, 'TransactionDetail'>;

const TRACKER_COLORS: Record<string, string> = {
  personal: COLORS.personalColor,
  reimbursement: COLORS.reimbursementColor,
  group: COLORS.groupColor,
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TransactionDetailScreen() {
  const route = useRoute<Route>();
  const nav = useNavigation<Nav>();
  const { isPremium } = usePremium();
  const { transactionId } = route.params;
  const [txn, setTxn] = useState<Transaction | null>(null);
  const [noteText, setNoteText] = useState('');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const tagInputRef = useRef<TextInput>(null);

  useEffect(() => {
    (async () => {
      const t = await getTransaction(transactionId);
      setTxn(t);
      if (t?.note) setNoteText(t.note);
    })();
  }, [transactionId]);

  const saveNote = async () => {
    if (!txn) return;
    const trimmed = noteText.trim();
    await updateTransaction(transactionId, { note: trimmed || undefined });
    setTxn(prev => prev ? { ...prev, note: trimmed || undefined } : prev);
    setIsEditingNote(false);
  };

  const addTag = async () => {
    if (!txn) return;
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    const currentTags = txn.tags || [];
    if (currentTags.includes(tag)) {
      setTagInput('');
      setIsAddingTag(false);
      return;
    }
    const newTags = [...currentTags, tag];
    await updateTransaction(transactionId, { tags: newTags });
    setTxn(prev => prev ? { ...prev, tags: newTags } : prev);
    setTagInput('');
    setIsAddingTag(false);
  };

  const removeTag = async (tag: string) => {
    if (!txn) return;
    const newTags = (txn.tags || []).filter(t => t !== tag);
    await updateTransaction(transactionId, { tags: newTags.length > 0 ? newTags : undefined });
    setTxn(prev => prev ? { ...prev, tags: newTags.length > 0 ? newTags : undefined } : prev);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTransaction(transactionId);
            nav.goBack();
          },
        },
      ],
    );
  };

  if (!txn) return null;

  const accentColor = TRACKER_COLORS[txn.trackerType] || COLORS.primary;

  const fields = [
    { label: 'Description', value: txn.description },
    txn.merchant ? { label: 'Merchant', value: txn.merchant } : null,
    { label: 'Date', value: formatDate(txn.timestamp) },
    { label: 'Source', value: txn.source },
    { label: 'Tracker', value: txn.trackerType.charAt(0).toUpperCase() + txn.trackerType.slice(1) },
  ].filter(Boolean);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Amount hero */}
      <LinearGradient
        colors={['#1A0A0C', COLORS.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.amountCard}
      >
        <View style={[styles.amountAccent, { backgroundColor: COLORS.danger }]} />
        <Text style={styles.amountLabel}>DEBITED</Text>
        <Text style={styles.amount}>{formatCurrency(txn.amount)}</Text>
        <View style={[styles.trackerBadge, { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}40` }]}>
          <Text style={[styles.trackerBadgeText, { color: accentColor }]}>
            {txn.trackerType.toUpperCase()}
          </Text>
        </View>
      </LinearGradient>

      {/* Detail rows */}
      <View style={styles.detailCard}>
        {fields.map((field, idx) => (
          <View
            key={field!.label}
            style={[
              styles.detailRow,
              idx === fields.length - 1 && styles.detailRowLast,
            ]}
          >
            <Text style={styles.detailLabel}>{field!.label}</Text>
            <Text style={styles.detailValue} numberOfLines={2}>{field!.value}</Text>
          </View>
        ))}
      </View>

      {/* Raw SMS */}
      {txn.rawMessage && (
        <View style={styles.smsCard}>
          <Text style={styles.smsLabel}>ORIGINAL SMS</Text>
          <Text style={styles.smsText}>{txn.rawMessage}</Text>
        </View>
      )}

      {/* Note */}
      {(() => {
        const isOld = Date.now() - txn.timestamp > THIRTY_DAYS;
        const noteLocked = isOld && !isPremium;
        return (
          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>NOTE</Text>
            {noteLocked ? (
              <TouchableOpacity onPress={() => nav.navigate('Pricing')}>
                <Text style={styles.notePlaceholder}>
                  {txn.note || 'Notes on transactions older than 30 days are a Premium feature'}
                </Text>
                {!txn.note && (
                  <Text style={styles.noteUpgrade}>Upgrade to add notes</Text>
                )}
              </TouchableOpacity>
            ) : isEditingNote ? (
              <>
                <TextInput
                  style={styles.noteInput}
                  value={noteText}
                  onChangeText={setNoteText}
                  placeholder="Add a note..."
                  placeholderTextColor={COLORS.textLight}
                  multiline
                  autoFocus
                />
                <View style={styles.noteActions}>
                  <TouchableOpacity onPress={() => { setNoteText(txn.note || ''); setIsEditingNote(false); }}>
                    <Text style={styles.noteCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.noteSaveBtn} onPress={saveNote}>
                    <Text style={styles.noteSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity onPress={() => setIsEditingNote(true)}>
                <Text style={txn.note ? styles.noteText : styles.notePlaceholder}>
                  {txn.note || 'Tap to add a note...'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })()}

      {/* Tags */}
      <View style={styles.tagCard}>
        <Text style={styles.tagLabel}>TAGS</Text>
        <View style={styles.tagWrap}>
          {(txn.tags || []).map(tag => (
            <TouchableOpacity
              key={tag}
              style={styles.tagChip}
              onPress={() => removeTag(tag)}
              activeOpacity={0.7}
            >
              <Text style={styles.tagChipText}>{tag}</Text>
              <Text style={styles.tagChipX}>{'\u00D7'}</Text>
            </TouchableOpacity>
          ))}
          {isAddingTag ? (
            <View style={styles.tagInputWrap}>
              <TextInput
                ref={tagInputRef}
                style={styles.tagInputField}
                value={tagInput}
                onChangeText={setTagInput}
                placeholder="tag name"
                placeholderTextColor={COLORS.textLight}
                autoFocus
                maxLength={20}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={addTag}
                onBlur={() => { if (!tagInput.trim()) setIsAddingTag(false); }}
                selectionColor={COLORS.primary}
              />
              <TouchableOpacity onPress={addTag} style={styles.tagSaveBtn}>
                <Text style={styles.tagSaveBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.tagAddBtn}
              onPress={() => setIsAddingTag(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.tagAddBtnText}>+ Add Tag</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Delete button */}
      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
        <Text style={styles.deleteBtnText}>Delete Transaction</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },

  amountCard: {
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: 24,
  },
  amountAccent: {
    alignSelf: 'stretch',
    height: 2,
    marginBottom: 20,
  },
  amountLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 8,
  },
  amount: {
    fontSize: 42,
    fontWeight: '800',
    color: COLORS.danger,
    letterSpacing: -1,
    marginBottom: 14,
  },
  trackerBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  trackerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  detailCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },

  smsCard: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  smsLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  smsText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    fontFamily: 'monospace',
  },

  noteCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noteLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  noteInput: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  noteText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  notePlaceholder: {
    fontSize: 14,
    color: COLORS.textLight,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  noteUpgrade: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 6,
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
  },
  noteCancelText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  noteSaveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  noteSaveText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '700',
  },

  /* ── Tags ────────────────────────────────────────────────────────── */
  tagCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.primary}15`,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    gap: 4,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  tagChipX: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginLeft: 2,
  },
  tagAddBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  tagAddBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tagInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagInputField: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    minWidth: 80,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  tagSaveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagSaveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.background,
  },

  deleteBtn: {
    borderWidth: 1,
    borderColor: `${COLORS.danger}40`,
    backgroundColor: `${COLORS.danger}10`,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  deleteBtnText: {
    color: COLORS.danger,
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
