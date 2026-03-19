import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ActivityIndicator,
  Animated,
} from 'react-native';

import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getTransaction, deleteTransaction, updateTransaction } from '../services/StorageService';
import { Transaction } from '../models/types';
import { usePremium } from '../store/PremiumContext';
import { useTheme } from '../store/ThemeContext';
import { formatCurrency, formatDate } from '../utils/helpers';
import {
  detectCategory, getAllAvailableCategories, recategorizeTransaction,
  CATEGORY_COLORS, CATEGORY_ICONS,
} from '../services/CategoryService';
import BottomSheet from '../components/BottomSheet';

const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;

type Route = RouteProp<RootStackParamList, 'TransactionDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TransactionDetailScreen() {
  const route = useRoute<Route>();
  const nav = useNavigation<Nav>();
  const { isPremium } = usePremium();
  const { colors } = useTheme();
  const { transactionId } = route.params;
  const [txn, setTxn] = useState<Transaction | null>(null);
  const [noteText, setNoteText] = useState('');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const tagInputRef = useRef<TextInput>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editMerchant, setEditMerchant] = useState('');

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [currentCategory, setCurrentCategory] = useState('');

  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const t = await getTransaction(transactionId);
      setTxn(t);
      if (t?.note) setNoteText(t.note);
      if (t) {
        setEditAmount(String(t.amount));
        setEditDescription(t.description);
        setEditMerchant(t.merchant || '');
        setCurrentCategory(t.category || detectCategory(t));
      }
      const cats = await getAllAvailableCategories();
      setCategories(cats);
    })();
  }, [transactionId]);

  const saveNote = async () => {
    if (!txn) return;
    const trimmed = noteText.trim();
    await updateTransaction(transactionId, { note: trimmed || undefined });
    setTxn(prev => prev ? { ...prev, note: trimmed || undefined } : prev);
    setIsEditingNote(false);
  };

  const saveEdits = async () => {
    if (!txn) return;
    const amount = parseFloat(editAmount);
    if (!amount || amount <= 0) { Alert.alert('Invalid', 'Please enter a valid amount.'); return; }
    const updates: Partial<Transaction> = {
      amount,
      description: editDescription.trim() || txn.description,
      merchant: editMerchant.trim() || undefined,
    };
    await updateTransaction(transactionId, updates);
    setTxn(prev => prev ? { ...prev, ...updates } : prev);
    setIsEditing(false);
  };

  const handleCategorySelect = async (category: string) => {
    await recategorizeTransaction(transactionId, category);
    setCurrentCategory(category);
    setTxn(prev => prev ? { ...prev, category } : prev);
    setShowCategoryPicker(false);
  };

  const addTag = async () => {
    if (!txn) return;
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    const currentTags = txn.tags || [];
    if (currentTags.includes(tag)) { setTagInput(''); setIsAddingTag(false); return; }
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
    Alert.alert('Delete Transaction', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteTransaction(transactionId); nav.goBack(); } },
    ]);
  };

  if (!txn) return (
    <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );

  const TRACKER_COLORS: Record<string, string> = {
    personal: colors.personalColor,
    reimbursement: colors.reimbursementColor,
    group: colors.groupColor,
  };

  const accentColor = TRACKER_COLORS[txn.trackerType] || colors.primary;
  const catColor = CATEGORY_COLORS[currentCategory] || '#6A6A8E';
  const catIcon = CATEGORY_ICONS[currentCategory] || '📦';

  const heroScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.15, 1],
    extrapolate: 'clamp',
  });

  const fields = [
    { label: 'Description', value: txn.description },
    txn.merchant ? { label: 'Merchant', value: txn.merchant } : null,
    { label: 'Date', value: formatDate(txn.timestamp) },
    { label: 'Source', value: txn.source },
    { label: 'Tracker', value: txn.trackerType.charAt(0).toUpperCase() + txn.trackerType.slice(1) },
  ].filter(Boolean);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
      >
        {/* Amount hero */}
        <Animated.View style={{ transform: [{ scale: heroScale }] }}>
          <View style={[styles.amountCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.amountAccent, { backgroundColor: colors.danger }]} />
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>DEBITED</Text>

            {isEditing ? (
              <View style={styles.editAmountRow}>
                <Text style={[styles.editCurrency, { color: colors.danger }]}>₹</Text>
                <TextInput
                  style={[styles.editAmountInput, { color: colors.danger }]}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectionColor={colors.primary}
                />
              </View>
            ) : (
              <Text style={[styles.amount, { color: colors.danger }]}>{formatCurrency(txn.amount)}</Text>
            )}

            <View style={styles.heroBadgeRow}>
              <View style={[styles.trackerBadge, { backgroundColor: `${accentColor}15`, borderColor: `${accentColor}30` }]}>
                <Text style={[styles.trackerBadgeText, { color: accentColor }]}>
                  {txn.trackerType.toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.categoryBadge, { backgroundColor: `${catColor}15`, borderColor: `${catColor}30` }]}
                onPress={() => setShowCategoryPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryBadgeIcon}>{catIcon}</Text>
                <Text style={[styles.categoryBadgeText, { color: catColor }]}>{currentCategory}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* Edit / Save toggle */}
        <View style={styles.editBar}>
          {isEditing ? (
            <View style={styles.editBarRow}>
              <TouchableOpacity onPress={() => { setIsEditing(false); setEditAmount(String(txn.amount)); setEditDescription(txn.description); setEditMerchant(txn.merchant || ''); }}>
                <Text style={[styles.editCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.editSaveBtn, { backgroundColor: colors.primary }]} onPress={saveEdits} activeOpacity={0.8}>
                <Text style={styles.editSaveBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setIsEditing(true)} activeOpacity={0.7}>
              <Text style={[styles.editTriggerText, { color: colors.primary }]}>Edit Transaction</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Detail rows */}
        <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {isEditing ? (
            <>
              <View style={[styles.editField, { borderBottomColor: colors.border }]}>
                <Text style={[styles.editFieldLabel, { color: colors.textSecondary }]}>DESCRIPTION</Text>
                <TextInput style={[styles.editFieldInput, { color: colors.text }]} value={editDescription} onChangeText={setEditDescription} placeholder="Description" placeholderTextColor={colors.textLight} selectionColor={colors.primary} />
              </View>
              <View style={styles.editField}>
                <Text style={[styles.editFieldLabel, { color: colors.textSecondary }]}>MERCHANT</Text>
                <TextInput style={[styles.editFieldInput, { color: colors.text }]} value={editMerchant} onChangeText={setEditMerchant} placeholder="Merchant (optional)" placeholderTextColor={colors.textLight} selectionColor={colors.primary} />
              </View>
            </>
          ) : (
            fields.map((field, idx) => (
              <View key={field!.label} style={[styles.detailRow, idx === fields.length - 1 && styles.detailRowLast, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{field!.label}</Text>
                <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={2}>{field!.value}</Text>
              </View>
            ))
          )}
        </View>

        {/* Raw SMS */}
        {txn.rawMessage && (
          <View style={[styles.smsCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
            <Text style={[styles.smsLabel, { color: colors.textSecondary }]}>ORIGINAL SMS</Text>
            <Text style={[styles.smsText, { color: colors.textSecondary }]}>{txn.rawMessage}</Text>
          </View>
        )}

        {/* Note */}
        {(() => {
          const isOld = Date.now() - txn.timestamp > SIXTY_DAYS;
          const noteLocked = isOld && !isPremium;
          return (
            <View style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.noteLabel, { color: colors.textSecondary }]}>NOTE</Text>
              {noteLocked ? (
                <TouchableOpacity onPress={() => nav.navigate('Pricing')}>
                  <Text style={[styles.notePlaceholder, { color: colors.textLight }]}>
                    {txn.note || 'Notes on transactions older than 60 days are a Premium feature'}
                  </Text>
                  {!txn.note && <Text style={[styles.noteUpgrade, { color: colors.primary }]}>Upgrade to add notes</Text>}
                </TouchableOpacity>
              ) : isEditingNote ? (
                <>
                  <TextInput style={[styles.noteInput, { color: colors.text }]} value={noteText} onChangeText={setNoteText} placeholder="Add a note..." placeholderTextColor={colors.textLight} multiline autoFocus />
                  <View style={styles.noteActions}>
                    <TouchableOpacity onPress={() => { setNoteText(txn.note || ''); setIsEditingNote(false); }}>
                      <Text style={[styles.noteCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.noteSaveBtn, { backgroundColor: colors.primary }]} onPress={saveNote}>
                      <Text style={styles.noteSaveText}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <TouchableOpacity onPress={() => setIsEditingNote(true)}>
                  <Text style={txn.note ? [styles.noteText, { color: colors.text }] : [styles.notePlaceholder, { color: colors.textLight }]}>
                    {txn.note || 'Tap to add a note...'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* Tags */}
        <View style={[styles.tagCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.tagLabel, { color: colors.textSecondary }]}>TAGS</Text>
          <View style={styles.tagWrap}>
            {(txn.tags || []).map(tag => (
              <TouchableOpacity key={tag} style={[styles.tagChip, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]} onPress={() => removeTag(tag)} activeOpacity={0.7}>
                <Text style={[styles.tagChipText, { color: colors.primary }]}>{tag}</Text>
                <Text style={[styles.tagChipX, { color: colors.textSecondary }]}>{'\u00D7'}</Text>
              </TouchableOpacity>
            ))}
            {isAddingTag ? (
              <View style={styles.tagInputWrap}>
                <TextInput ref={tagInputRef} style={[styles.tagInputField, { backgroundColor: colors.surfaceHigh, borderColor: colors.primary, color: colors.text }]} value={tagInput} onChangeText={setTagInput} placeholder="tag name" placeholderTextColor={colors.textLight} autoFocus maxLength={20} autoCapitalize="none" returnKeyType="done" onSubmitEditing={addTag} onBlur={() => { if (!tagInput.trim()) setIsAddingTag(false); }} selectionColor={colors.primary} />
                <TouchableOpacity onPress={addTag} style={[styles.tagSaveBtn, { backgroundColor: colors.primary }]}>
                  <Text style={styles.tagSaveBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.tagAddBtn, { borderColor: colors.border }]} onPress={() => setIsAddingTag(true)} activeOpacity={0.7}>
                <Text style={[styles.tagAddBtnText, { color: colors.textSecondary }]}>+ Add Tag</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Delete button */}
        <TouchableOpacity style={[styles.deleteBtn, { borderColor: `${colors.danger}30`, backgroundColor: `${colors.danger}08` }]} onPress={handleDelete} activeOpacity={0.7}>
          <Text style={[styles.deleteBtnText, { color: colors.danger }]}>Delete Transaction</Text>
        </TouchableOpacity>
      </Animated.ScrollView>

      {/* Category Picker */}
      <BottomSheet visible={showCategoryPicker} onClose={() => setShowCategoryPicker(false)}>
        <Text style={[styles.pickerTitle, { color: colors.text }]}>Choose Category</Text>
        <View style={styles.pickerGrid}>
          {categories.map(cat => {
            const isActive = cat === currentCategory;
            const color = CATEGORY_COLORS[cat] || '#6A6A8E';
            const icon = CATEGORY_ICONS[cat] || '📦';
            return (
              <TouchableOpacity key={cat} style={[styles.pickerItem, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }, isActive && { borderColor: color, backgroundColor: `${color}10` }]} onPress={() => handleCategorySelect(cat)} activeOpacity={0.7}>
                <Text style={styles.pickerIcon}>{icon}</Text>
                <Text style={[styles.pickerLabel, { color: colors.textSecondary }, isActive && { color }]} numberOfLines={1}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  amountCard: { borderRadius: 16, marginBottom: 12, borderWidth: 1, overflow: 'hidden', alignItems: 'center', paddingBottom: 24 },
  amountAccent: { alignSelf: 'stretch', height: 2, marginBottom: 20 },
  amountLabel: { fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 8 },
  amount: { fontSize: 42, fontWeight: '800', letterSpacing: -1, marginBottom: 14 },
  heroBadgeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  trackerBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  trackerBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, gap: 4 },
  categoryBadgeIcon: { fontSize: 12 },
  categoryBadgeText: { fontSize: 11, fontWeight: '700' },

  editAmountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  editCurrency: { fontSize: 32, fontWeight: '800' },
  editAmountInput: { fontSize: 38, fontWeight: '800', minWidth: 100, textAlign: 'center' },
  editBar: { marginBottom: 12, alignItems: 'center' },
  editBarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  editTriggerText: { fontSize: 13, fontWeight: '600', paddingVertical: 8 },
  editCancelText: { fontSize: 13, fontWeight: '600', paddingVertical: 8 },
  editSaveBtn: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 20 },
  editSaveBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  editField: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1 },
  editFieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  editFieldInput: { fontSize: 14, fontWeight: '600', paddingVertical: 4 },

  detailCard: { borderRadius: 12, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1 },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { fontSize: 13, fontWeight: '500' },
  detailValue: { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 16 },

  smsCard: { borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  smsLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  smsText: { fontSize: 13, lineHeight: 19, fontFamily: 'monospace' },

  noteCard: { borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  noteLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  noteInput: { fontSize: 14, lineHeight: 20, minHeight: 60, textAlignVertical: 'top' },
  noteText: { fontSize: 14, lineHeight: 20 },
  notePlaceholder: { fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  noteUpgrade: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  noteActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 },
  noteCancelText: { fontSize: 13, fontWeight: '600', paddingVertical: 6, paddingHorizontal: 12 },
  noteSaveBtn: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 16 },
  noteSaveText: { fontSize: 13, color: '#fff', fontWeight: '700' },

  tagCard: { borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  tagLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  tagChip: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, gap: 4 },
  tagChipText: { fontSize: 12, fontWeight: '600' },
  tagChipX: { fontSize: 14, fontWeight: '700', marginLeft: 2 },
  tagAddBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed' },
  tagAddBtnText: { fontSize: 12, fontWeight: '600' },
  tagInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagInputField: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, fontSize: 13, fontWeight: '600', minWidth: 80, borderWidth: 1 },
  tagSaveBtn: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  tagSaveBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  deleteBtn: { borderWidth: 1, borderRadius: 12, padding: 16, alignItems: 'center' },
  deleteBtnText: { fontWeight: '700', fontSize: 14, letterSpacing: 0.3 },

  pickerTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20, textAlign: 'center' },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingBottom: 10 },
  pickerItem: { width: '28%', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1 },
  pickerIcon: { fontSize: 22, marginBottom: 6 },
  pickerLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
});
