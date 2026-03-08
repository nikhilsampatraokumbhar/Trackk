import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, Alert, Modal, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTracker } from '../store/TrackerContext';
import { getTransactions, updateTransaction } from '../services/StorageService';
import { Transaction } from '../models/types';
import TrackerToggle from '../components/TrackerToggle';
import TransactionCard from '../components/TransactionCard';
import { COLORS, formatCurrency } from '../utils/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ReimbursementScreen() {
  const nav = useNavigation<Nav>();
  const { trackerState, toggleReimbursement } = useTracker();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const txns = await getTransactions('reimbursement');
    setTransactions(txns.sort((a, b) => b.timestamp - a.timestamp));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const total = transactions.reduce((s, t) => s + t.amount, 0);

  // ── Monthly breakdown for Expense Summary ──────────────────────────────
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

  // ── Receipt capture (simulated) ────────────────────────────────────────
  const handleReceiptPress = (transactionId: string) => {
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
        Alert.alert('Receipt saved', 'Receipt attached to this expense.');
      }
    } catch (err) {
      Alert.alert('Error', 'Could not capture receipt. Please try again.');
    }
  };

  const handleDownloadAllReceipts = () => {
    const withReceipts = transactions.filter(t => t.receiptUri);
    if (withReceipts.length === 0) {
      Alert.alert('No Receipts', 'No receipts have been attached to any expenses yet.');
      return;
    }
    Alert.alert(
      'Receipts Summary',
      `${withReceipts.length} receipt(s) saved locally on your device.\n\nCloud backup & export coming with Trackk Premium.`,
    );
  };

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        ListHeaderComponent={() => (
          <>
            <TrackerToggle
              label="Reimbursement"
              subtitle="Track office / business expenses"
              isActive={trackerState.reimbursement}
              onToggle={toggleReimbursement}
              color={COLORS.reimbursementColor}
            />

            {/* ── Expense Summary (monthly breakdown) ─────────────────── */}
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
                  <Text style={[styles.heroAmount, { color: COLORS.reimbursementColor }]}>
                    {formatCurrency(total)}
                  </Text>
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{transactions.length}</Text>
                  <Text style={styles.countLabel}>expenses</Text>
                </View>
              </View>
            </LinearGradient>

            <Text style={styles.sectionTitle}>ALL EXPENSES</Text>

            {transactions.length === 0 && (
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
        )}
        data={transactions}
        keyExtractor={item => item.id}
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
        ListFooterComponent={() =>
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
      />

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
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },

  /* ── Expense Summary Card ─────────────────────────────────────── */
  summaryCard: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  summaryIcon: {
    fontSize: 16,
  },
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
    borderRadius: 18,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  transactionCardWrap: {
    flex: 1,
  },
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
  receiptBtnIcon: {
    fontSize: 18,
  },
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
  downloadBtnIcon: {
    fontSize: 18,
  },
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
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  modalOptionIcon: {
    fontSize: 22,
  },
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
});
