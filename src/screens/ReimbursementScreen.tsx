import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, SectionList, RefreshControl,
  TouchableOpacity, Alert, Modal, Image, AppState,
  TextInput, KeyboardAvoidingView, Platform, Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { useTracker } from '../store/TrackerContext';
import { usePremium } from '../store/PremiumContext';
import { getTransactions, updateTransaction, saveTransaction } from '../services/StorageService';
import { exportReimbursementReceipts } from '../services/ExportService';
import { Transaction, ParsedTransaction } from '../models/types';
import TrackerToggle from '../components/TrackerToggle';
import TransactionCard from '../components/TransactionCard';
import SuccessOverlay from '../components/SuccessOverlay';
import AnimatedAmount from '../components/AnimatedAmount';
import { HeroCardSkeleton, TransactionListSkeleton } from '../components/SkeletonLoader';
import { COLORS, formatCurrency, groupByDate } from '../utils/helpers';
import { REIMBURSEMENT_CATEGORIES } from '../utils/categories';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ReimbursementScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { trackerState, toggleReimbursement, transactionVersion } = useTracker();
  const { isPremium } = usePremium();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  // Manual expense modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Success overlay
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [successSub, setSuccessSub] = useState('');

  const load = useCallback(async () => {
    const txns = await getTransactions('reimbursement');
    setTransactions(txns.sort((a, b) => b.timestamp - a.timestamp));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load, transactionVersion]));

  // Reload data when app returns from background
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        load();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleCategorySelect = (label: string) => {
    Vibration.vibrate(30);
    setSelectedCategory(label);
    setAddDescription(label);
  };

  const handleAddExpense = async () => {
    const amount = parseFloat(addAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid', 'Please enter a valid amount.');
      return;
    }
    Vibration.vibrate(40);
    setSaving(true);
    try {
      const desc = addDescription.trim() || selectedCategory || 'Office expense';
      const parsed: ParsedTransaction = {
        amount,
        type: 'debit',
        merchant: desc,
        rawMessage: `Manual entry: ${desc} - ${amount}`,
        timestamp: Date.now(),
      };
      await saveTransaction(parsed, 'reimbursement', user?.id || '');
      setShowAddModal(false);
      setAddAmount('');
      setAddDescription('');
      setSelectedCategory(null);
      await load();
      setSuccessMessage('Expense Saved');
      setSuccessSub(formatCurrency(amount) + ' added to reimbursements');
      setShowSuccess(true);
    } catch {
      Alert.alert('Error', 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  };

  const total = transactions.reduce((s, t) => s + t.amount, 0);

  // Monthly breakdown for Expense Summary
  const monthlyBreakdown = useMemo(() => {
    const map: Record<string, { label: string; total: number; count: number }> = {};
    transactions.forEach(t => {
      const d = new Date(t.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      if (!map[key]) map[key] = { label, total: 0, count: 0 };
      map[key].total += t.amount;
      map[key].count += 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, v]) => v);
  }, [transactions]);

  // Date-grouped sections
  const sections = useMemo(() => groupByDate(transactions), [transactions]);

  // Receipt capture
  const handleReceiptPress = (transactionId: string) => {
    Vibration.vibrate(30);
    setSelectedTransactionId(transactionId);
    setReceiptModalVisible(true);
  };

  const handleReceiptOption = async (option: 'camera' | 'gallery') => {
    setReceiptModalVisible(false);
    try {
      let result: ImagePicker.ImagePickerResult;
      if (option === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera access is required to capture receipts.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Gallery access is required to select receipts.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets[0] && selectedTransactionId) {
        await updateTransaction(selectedTransactionId, { receiptUri: result.assets[0].uri });
        await load();
        Vibration.vibrate(50);
        setSuccessMessage('Receipt Saved');
        setSuccessSub('Receipt attached to expense');
        setShowSuccess(true);
      }
    } catch (err) {
      Alert.alert('Error', 'Could not capture receipt. Please try again.');
    }
  };

  const handleDownloadAllReceipts = async () => {
    if (!isPremium) {
      Alert.alert(
        'Premium Feature',
        'Export reimbursement receipts with named files and CSV summary is a Premium feature. Upgrade to unlock!',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'View Plans', onPress: () => nav.navigate('Pricing') },
        ],
      );
      return;
    }

    const withReceipts = transactions.filter(t => t.receiptUri);
    if (withReceipts.length === 0) {
      Alert.alert('No Receipts', 'No receipts have been attached to any expenses yet.');
      return;
    }

    Vibration.vibrate(30);
    Alert.alert(
      'Export Reimbursement',
      `Export ${transactions.length} expense(s) with ${withReceipts.length} receipt(s)?\n\nReceipts will be named as:\nMerchant_Date.jpg (e.g., Swiggy_2024-03-15.jpg)`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            const result = await exportReimbursementReceipts(transactions);
            if (result.success) {
              setSuccessMessage('Export Ready');
              setSuccessSub(`${result.count} receipt(s) + summary CSV`);
              setShowSuccess(true);
            } else {
              Alert.alert('Export Failed', result.error || 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const renderHeader = () => (
    <>
      <TrackerToggle
        label="Reimbursement"
        subtitle="Track office / business expenses"
        isActive={trackerState.reimbursement}
        onToggle={toggleReimbursement}
        color={COLORS.reimbursementColor}
      />

      {/* Expense Summary (monthly breakdown) */}
      {monthlyBreakdown.length > 0 && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryIcon}>📊</Text>
            <Text style={styles.summaryTitle}>EXPENSE SUMMARY</Text>
          </View>
          <View style={styles.summaryDivider} />
          {monthlyBreakdown.map((m, i) => (
            <View key={i} style={styles.summaryRow}>
              <Text style={styles.summaryMonth}>{m.label}</Text>
              <View style={styles.summaryRight}>
                <Text style={styles.summaryCount}>{m.count} txns</Text>
                <Text style={styles.summaryAmount}>
                  {formatCurrency(m.total)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {loading ? (
        <HeroCardSkeleton />
      ) : (
        <LinearGradient
          colors={['#200E12', '#0A0A0F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={[styles.heroAccent, { backgroundColor: COLORS.reimbursementColor }]} />
          <View style={styles.heroBody}>
            <View>
              <Text style={styles.heroLabel}>TOTAL REIMBURSABLE</Text>
              <AnimatedAmount
                value={total}
                style={[styles.heroAmount, { color: COLORS.reimbursementColor }]}
              />
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{transactions.length}</Text>
              <Text style={styles.countLabel}>expenses</Text>
            </View>
          </View>
        </LinearGradient>
      )}

      {loading && <TransactionListSkeleton count={3} />}

      {!loading && transactions.length === 0 && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyEmoji}>🧾</Text>
          </View>
          <Text style={styles.emptyText}>
            {trackerState.reimbursement
              ? 'No reimbursement expenses yet'
              : 'Enable the tracker to log office expenses'}
          </Text>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <SectionList
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        ListHeaderComponent={renderHeader}
        sections={loading ? [] : sections}
        keyExtractor={item => item.id}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.transactionRow}>
            <View style={styles.transactionCardWrap}>
              <TransactionCard
                transaction={item}
                onPress={() => nav.navigate('TransactionDetail', { transactionId: item.id })}
              />
            </View>
            <TouchableOpacity
              style={[styles.receiptBtn, item.receiptUri ? styles.receiptBtnAttached : null]}
              onPress={() => handleReceiptPress(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.receiptBtnIcon}>{item.receiptUri ? '✅' : '📷'}</Text>
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          transactions.length > 0 ? (
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={handleDownloadAllReceipts}
              activeOpacity={0.8}
            >
              <Text style={styles.downloadBtnIcon}>📥</Text>
              <Text style={styles.downloadBtnText}>Download All Receipts</Text>
            </TouchableOpacity>
          ) : null
        }
        stickySectionHeadersEnabled={false}
      />

      {/* Add Expense FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => { Vibration.vibrate(30); setShowAddModal(true); }}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>Add Expense</Text>
      </TouchableOpacity>

      {/* Receipt Options Modal */}
      <Modal
        visible={receiptModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setReceiptModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Receipt</Text>
            <Text style={styles.modalSubtitle}>Attach a receipt to this expense</Text>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleReceiptOption('camera')}
              activeOpacity={0.7}
            >
              <Text style={styles.modalOptionIcon}>📸</Text>
              <Text style={styles.modalOptionText}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleReceiptOption('gallery')}
              activeOpacity={0.7}
            >
              <Text style={styles.modalOptionIcon}>🖼️</Text>
              <Text style={styles.modalOptionText}>Choose from Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setReceiptModalVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Expense Modal */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.addModalOverlay}>
          <View style={styles.addModalSheet}>
            <View style={styles.addModalHandle} />
            <Text style={styles.addModalTitle}>Add Office Expense</Text>
            <Text style={styles.addModalSub}>Log a cash or missed reimbursable expense</Text>

            {/* Category Quick Picks */}
            <Text style={styles.addModalLabel}>CATEGORY</Text>
            <View style={styles.categoryRow}>
              {REIMBURSEMENT_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.label}
                  style={[
                    styles.categoryChip,
                    selectedCategory === cat.label && styles.categoryChipActive,
                  ]}
                  onPress={() => handleCategorySelect(cat.label)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryChipIcon}>{cat.icon}</Text>
                  <Text style={[
                    styles.categoryChipText,
                    selectedCategory === cat.label && styles.categoryChipTextActive,
                  ]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.addModalLabel}>AMOUNT</Text>
            <View style={styles.addModalAmountRow}>
              <Text style={styles.addModalCurrency}>₹</Text>
              <TextInput
                style={styles.addModalAmountInput}
                value={addAmount}
                onChangeText={setAddAmount}
                placeholder="0"
                placeholderTextColor={COLORS.textLight}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            <Text style={styles.addModalLabel}>DESCRIPTION</Text>
            <TextInput
              style={styles.addModalDescInput}
              value={addDescription}
              onChangeText={(t) => { setAddDescription(t); setSelectedCategory(null); }}
              placeholder="e.g. Cab to office, Client lunch..."
              placeholderTextColor={COLORS.textLight}
              maxLength={200}
            />

            <TouchableOpacity
              style={[styles.addModalSaveBtn, saving && { opacity: 0.5 }]}
              onPress={handleAddExpense}
              disabled={saving}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[COLORS.reimbursementColor, '#8B2020']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addModalSaveBtnGradient}
              >
                <Text style={styles.addModalSaveBtnText}>
                  {saving ? 'Saving...' : 'Save Expense'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addModalCancelBtn} onPress={() => { setShowAddModal(false); setAddAmount(''); setAddDescription(''); setSelectedCategory(null); }}>
              <Text style={styles.addModalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Success Overlay */}
      <SuccessOverlay
        visible={showSuccess}
        message={successMessage}
        subMessage={successSub}
        onDone={() => setShowSuccess(false)}
        color={COLORS.reimbursementColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },

  /* ── Expense Summary Card ─────────────────────────────────────── */
  summaryCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 20,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  summaryIcon: { fontSize: 16 },
  summaryTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryMonth: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  summaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryCount: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  summaryAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.reimbursementColor,
  },

  /* ── Hero Card ────────────────────────────────────────────────── */
  heroCard: {
    borderRadius: 24,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    overflow: 'hidden',
  },
  heroAccent: { height: 2 },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  heroLabel: {
    fontSize: 9,
    color: COLORS.textSecondary,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 8,
  },
  heroAmount: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHigher,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  countText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  countLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
    marginTop: 16,
  },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyEmoji: { fontSize: 26 },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  /* ── Transaction row with receipt button ──────────────────────── */
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  transactionCardWrap: { flex: 1 },
  receiptBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  receiptBtnIcon: { fontSize: 18 },
  receiptBtnAttached: {
    borderColor: `${COLORS.success}50`,
    backgroundColor: `${COLORS.success}15`,
  },

  /* ── Download All Receipts ────────────────────────────────────── */
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  downloadBtnIcon: { fontSize: 18 },
  downloadBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.3,
  },

  /* ── Receipt Options Modal ────────────────────────────────────── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#131318',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
  },
  modalOptionIcon: { fontSize: 22 },
  modalOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalCancel: {
    alignItems: 'center',
    padding: 14,
    marginTop: 6,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  /* ── FAB ──────────────────────────────────────────────────────── */
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.reimbursementColor,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    elevation: 8,
    shadowColor: COLORS.reimbursementColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  fabIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginRight: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.3,
  },

  /* ── Add Expense Modal ────────────────────────────────────────── */
  addModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  addModalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderBottomWidth: 0,
  },
  addModalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surfaceHigher,
    alignSelf: 'center',
    marginBottom: 20,
  },
  addModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  addModalSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  addModalLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 8,
  },

  /* ── Category Quick Picks ─────────────────────────────────────── */
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    gap: 6,
  },
  categoryChipActive: {
    borderColor: COLORS.reimbursementColor,
    backgroundColor: `${COLORS.reimbursementColor}15`,
  },
  categoryChipIcon: { fontSize: 16 },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  categoryChipTextActive: {
    color: COLORS.reimbursementColor,
  },

  addModalAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass,
    borderRadius: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    marginBottom: 20,
  },
  addModalCurrency: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.reimbursementColor,
    marginRight: 4,
  },
  addModalAmountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    paddingVertical: 14,
  },
  addModalDescInput: {
    backgroundColor: COLORS.glass,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    marginBottom: 24,
  },
  addModalSaveBtn: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 12,
  },
  addModalSaveBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 30,
  },
  addModalSaveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  addModalCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  addModalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});
