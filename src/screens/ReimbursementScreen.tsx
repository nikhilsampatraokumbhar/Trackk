import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, SectionList, RefreshControl,
  TouchableOpacity, Alert, Modal, TextInput, KeyboardAvoidingView,
  Platform, Vibration, AppState, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { useTracker } from '../store/TrackerContext';
import { usePremium } from '../store/PremiumContext';
import {
  getReimbursementTrips, createReimbursementTrip, completeReimbursementTrip,
  archiveReimbursementTrip, getTripTransactions, saveReimbursementExpense,
  updateTransaction,
} from '../services/StorageService';
import { exportReimbursementReceipts } from '../services/ExportService';
import { Transaction, ParsedTransaction, ReimbursementTrip } from '../models/types';
import TransactionCard from '../components/TransactionCard';
import SuccessOverlay from '../components/SuccessOverlay';
import { COLORS, formatCurrency, groupByDate } from '../utils/helpers';
import { REIMBURSEMENT_CATEGORIES } from '../utils/categories';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ReimbursementScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { trackerState, toggleReimbursement, transactionVersion } = useTracker();
  const { isPremium } = usePremium();

  // Trip list state
  const [trips, setTrips] = useState<ReimbursementTrip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<ReimbursementTrip | null>(null);
  const [tripTransactions, setTripTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Create trip modal
  const [showCreateTrip, setShowCreateTrip] = useState(false);
  const [tripName, setTripName] = useState('');

  // Add expense modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Receipt modal
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  // Success overlay
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [successSub, setSuccessSub] = useState('');

  const loadTrips = useCallback(async () => {
    const all = await getReimbursementTrips();
    setTrips(all);
    setLoading(false);
  }, []);

  const loadTripDetail = useCallback(async (trip: ReimbursementTrip) => {
    const txns = await getTripTransactions(trip.id);
    setTripTransactions(txns);
  }, []);

  useFocusEffect(useCallback(() => {
    if (selectedTrip) {
      loadTripDetail(selectedTrip);
    } else {
      loadTrips();
    }
  }, [loadTrips, loadTripDetail, selectedTrip, transactionVersion]));

  // Reload on app foreground
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        if (selectedTrip) loadTripDetail(selectedTrip);
        else loadTrips();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [loadTrips, loadTripDetail, selectedTrip]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (selectedTrip) await loadTripDetail(selectedTrip);
    else await loadTrips();
    setRefreshing(false);
  };

  // ─── Trip Actions ────────────────────────────────────────────

  const handleCreateTrip = async () => {
    const name = tripName.trim();
    if (!name) {
      Alert.alert('Enter a name', 'Give your expense log a name like "US Trip" or "Client Visit".');
      return;
    }
    Vibration.vibrate(40);
    const trip = await createReimbursementTrip(name);
    setTripName('');
    setShowCreateTrip(false);
    await loadTrips();
    setSuccessMessage('Trip Created');
    setSuccessSub(`"${trip.name}" is ready for expenses`);
    setShowSuccess(true);
  };

  const handleCompleteTrip = (trip: ReimbursementTrip) => {
    Alert.alert(
      'Complete Trip',
      `Mark "${trip.name}" as completed? You can still export but won't be able to add new expenses.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete', onPress: async () => {
            Vibration.vibrate(40);
            await completeReimbursementTrip(trip.id);
            setSelectedTrip({ ...trip, status: 'completed', completedAt: Date.now() });
            await loadTrips();
            setSuccessMessage('Trip Completed');
            setSuccessSub(`"${trip.name}" is ready to export`);
            setShowSuccess(true);
          },
        },
      ],
    );
  };

  const handleArchiveTrip = (trip: ReimbursementTrip) => {
    Alert.alert(
      'Archive Trip',
      `Archive "${trip.name}"? It will be hidden from the main list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive', onPress: async () => {
            Vibration.vibrate(40);
            await archiveReimbursementTrip(trip.id);
            setSelectedTrip(null);
            await loadTrips();
          },
        },
      ],
    );
  };

  // ─── Expense Actions ─────────────────────────────────────────

  const handleCategorySelect = (label: string) => {
    Vibration.vibrate(30);
    setSelectedCategory(label);
    setAddDescription(label);
  };

  const handleAddExpense = async () => {
    if (!selectedTrip) return;
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
      await saveReimbursementExpense(parsed, selectedTrip.id, user?.id || '');
      setShowAddModal(false);
      setAddAmount('');
      setAddDescription('');
      setSelectedCategory(null);
      await loadTripDetail(selectedTrip);
      setSuccessMessage('Expense Saved');
      setSuccessSub(formatCurrency(amount) + ' added to ' + selectedTrip.name);
      setShowSuccess(true);
    } catch {
      Alert.alert('Error', 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Receipt ─────────────────────────────────────────────────

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
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Gallery access is required to select receipts.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      }
      if (!result.canceled && result.assets[0] && selectedTransactionId) {
        await updateTransaction(selectedTransactionId, { receiptUri: result.assets[0].uri });
        if (selectedTrip) await loadTripDetail(selectedTrip);
        Vibration.vibrate(50);
        setSuccessMessage('Receipt Saved');
        setSuccessSub('Receipt attached to expense');
        setShowSuccess(true);
      }
    } catch {
      Alert.alert('Error', 'Could not capture receipt. Please try again.');
    }
  };

  const handleExport = async () => {
    if (!isPremium) {
      Alert.alert(
        'Premium Feature',
        'Export reimbursement receipts with named files and CSV summary is a Premium feature.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'View Plans', onPress: () => nav.navigate('Pricing') },
        ],
      );
      return;
    }
    const withReceipts = tripTransactions.filter(t => t.receiptUri);
    if (withReceipts.length === 0) {
      Alert.alert('No Receipts', 'No receipts attached to expenses in this trip yet.');
      return;
    }
    Vibration.vibrate(30);
    Alert.alert(
      'Export Trip',
      `Export ${tripTransactions.length} expense(s) with ${withReceipts.length} receipt(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            const result = await exportReimbursementReceipts(tripTransactions);
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

  // ─── Trip Detail View ────────────────────────────────────────

  const tripTotal = tripTransactions.reduce((s, t) => s + t.amount, 0);
  const tripSections = useMemo(() => groupByDate(tripTransactions), [tripTransactions]);

  if (selectedTrip) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={() => setSelectedTrip(null)} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.detailHeaderInfo}>
            <Text style={styles.detailTitle} numberOfLines={1}>{selectedTrip.name}</Text>
            <View style={[styles.statusBadge, selectedTrip.status === 'active' ? styles.statusActive : styles.statusCompleted]}>
              <Text style={[styles.statusText, selectedTrip.status === 'active' ? styles.statusTextActive : styles.statusTextCompleted]}>
                {selectedTrip.status === 'active' ? 'Active' : 'Completed'}
              </Text>
            </View>
          </View>
        </View>

        <SectionList
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />
          }
          ListHeaderComponent={
            <>
              {/* Hero Card */}
              <LinearGradient
                colors={['#200E12', '#0A0A0F']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                <View style={[styles.heroAccent, { backgroundColor: COLORS.reimbursementColor }]} />
                <View style={styles.heroBody}>
                  <View>
                    <Text style={styles.heroLabel}>TOTAL EXPENSES</Text>
                    <Text style={[styles.heroAmount, { color: COLORS.reimbursementColor }]}>
                      {formatCurrency(tripTotal)}
                    </Text>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{tripTransactions.length}</Text>
                    <Text style={styles.countLabel}>expenses</Text>
                  </View>
                </View>
              </LinearGradient>

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                {selectedTrip.status === 'active' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: COLORS.success }]}
                    onPress={() => handleCompleteTrip(selectedTrip)}
                  >
                    <Text style={styles.actionBtnIcon}>✓</Text>
                    <Text style={[styles.actionBtnText, { color: COLORS.success }]}>Complete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: COLORS.primary }]}
                  onPress={handleExport}
                >
                  <Text style={styles.actionBtnIcon}>📥</Text>
                  <Text style={[styles.actionBtnText, { color: COLORS.primary }]}>Export</Text>
                </TouchableOpacity>
                {selectedTrip.status === 'completed' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: COLORS.textSecondary }]}
                    onPress={() => handleArchiveTrip(selectedTrip)}
                  >
                    <Text style={styles.actionBtnIcon}>📦</Text>
                    <Text style={[styles.actionBtnText, { color: COLORS.textSecondary }]}>Archive</Text>
                  </TouchableOpacity>
                )}
              </View>

              {tripTransactions.length === 0 && (
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>🧾</Text>
                  <Text style={styles.emptyText}>No expenses yet. Tap + to add one.</Text>
                </View>
              )}
            </>
          }
          sections={tripSections}
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
          stickySectionHeadersEnabled={false}
        />

        {/* Add Expense FAB (only for active trips) */}
        {selectedTrip.status === 'active' && (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => { Vibration.vibrate(30); setShowAddModal(true); }}
            activeOpacity={0.8}
          >
            <Text style={styles.fabIcon}>+</Text>
            <Text style={styles.fabText}>Add Expense</Text>
          </TouchableOpacity>
        )}

        {renderAddExpenseModal()}
        {renderReceiptModal()}
        <SuccessOverlay
          visible={showSuccess}
          message={successMessage}
          subMessage={successSub}
          onDone={() => setShowSuccess(false)}
          color={COLORS.reimbursementColor}
        />
      </SafeAreaView>
    );
  }

  // ─── Trip List View ──────────────────────────────────────────

  const activeTrips = trips.filter(t => t.status === 'active');
  const completedTrips = trips.filter(t => t.status === 'completed');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />
        }
      >
        <Text style={styles.screenTitle}>Reimbursements</Text>
        <Text style={styles.screenSub}>Create expense logs for trips and business expenses</Text>

        {/* Active Trips */}
        {activeTrips.length > 0 && (
          <>
            <Text style={styles.listLabel}>ACTIVE</Text>
            {activeTrips.map(trip => (
              <TripCard key={trip.id} trip={trip} onPress={() => { setSelectedTrip(trip); loadTripDetail(trip); }} />
            ))}
          </>
        )}

        {/* Completed Trips */}
        {completedTrips.length > 0 && (
          <>
            <Text style={styles.listLabel}>COMPLETED</Text>
            {completedTrips.map(trip => (
              <TripCard key={trip.id} trip={trip} onPress={() => { setSelectedTrip(trip); loadTripDetail(trip); }} />
            ))}
          </>
        )}

        {trips.length === 0 && !loading && (
          <View style={styles.emptyTrips}>
            <Text style={styles.emptyTripsEmoji}>✈️</Text>
            <Text style={styles.emptyTripsTitle}>No Expense Logs Yet</Text>
            <Text style={styles.emptyTripsText}>
              Create an expense log for your next trip or business visit. Track expenses, attach receipts, and export when done.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Create Trip FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => { Vibration.vibrate(30); setShowCreateTrip(true); }}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>New Trip</Text>
      </TouchableOpacity>

      {/* Create Trip Modal */}
      <Modal visible={showCreateTrip} transparent animationType="slide" onRequestClose={() => setShowCreateTrip(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.addModalOverlay}>
          <View style={styles.addModalSheet}>
            <View style={styles.addModalHandle} />
            <Text style={styles.addModalTitle}>New Expense Log</Text>
            <Text style={styles.addModalSub}>Name your trip or business visit</Text>

            <Text style={styles.addModalLabel}>TRIP NAME</Text>
            <TextInput
              style={styles.tripNameInput}
              value={tripName}
              onChangeText={setTripName}
              placeholder="e.g. US Trip, Client Visit Delhi..."
              placeholderTextColor={COLORS.textLight}
              autoFocus
              maxLength={100}
            />

            <TouchableOpacity style={styles.createTripBtn} onPress={handleCreateTrip} activeOpacity={0.8}>
              <LinearGradient
                colors={[COLORS.reimbursementColor, '#8B2020']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.createTripBtnGradient}
              >
                <Text style={styles.createTripBtnText}>Create Expense Log</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addModalCancelBtn} onPress={() => { setShowCreateTrip(false); setTripName(''); }}>
              <Text style={styles.addModalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SuccessOverlay
        visible={showSuccess}
        message={successMessage}
        subMessage={successSub}
        onDone={() => setShowSuccess(false)}
        color={COLORS.reimbursementColor}
      />
    </SafeAreaView>
  );

  // ─── Shared Modals ──────────────────────────────────────────

  function renderAddExpenseModal() {
    return (
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.addModalOverlay}>
          <View style={styles.addModalSheet}>
            <View style={styles.addModalHandle} />
            <Text style={styles.addModalTitle}>Add Expense</Text>
            <Text style={styles.addModalSub}>Log an expense to {selectedTrip?.name}</Text>

            <Text style={styles.addModalLabel}>CATEGORY</Text>
            <View style={styles.categoryRow}>
              {REIMBURSEMENT_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.label}
                  style={[styles.categoryChip, selectedCategory === cat.label && styles.categoryChipActive]}
                  onPress={() => handleCategorySelect(cat.label)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryChipIcon}>{cat.icon}</Text>
                  <Text style={[styles.categoryChipText, selectedCategory === cat.label && styles.categoryChipTextActive]}>
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
                <Text style={styles.addModalSaveBtnText}>{saving ? 'Saving...' : 'Save Expense'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addModalCancelBtn} onPress={() => { setShowAddModal(false); setAddAmount(''); setAddDescription(''); setSelectedCategory(null); }}>
              <Text style={styles.addModalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  function renderReceiptModal() {
    return (
      <Modal visible={receiptModalVisible} transparent animationType="fade" onRequestClose={() => setReceiptModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setReceiptModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Receipt</Text>
            <Text style={styles.modalSubtitle}>Attach a receipt to this expense</Text>
            <TouchableOpacity style={styles.modalOption} onPress={() => handleReceiptOption('camera')} activeOpacity={0.7}>
              <Text style={styles.modalOptionIcon}>📸</Text>
              <Text style={styles.modalOptionText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => handleReceiptOption('gallery')} activeOpacity={0.7}>
              <Text style={styles.modalOptionIcon}>🖼️</Text>
              <Text style={styles.modalOptionText}>Choose from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setReceiptModalVisible(false)} activeOpacity={0.7}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  }
}

// ─── Trip Card Component ────────────────────────────────────────────────────

function TripCard({ trip, onPress }: { trip: ReimbursementTrip; onPress: () => void }) {
  const dateStr = new Date(trip.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const isActive = trip.status === 'active';

  return (
    <TouchableOpacity style={styles.tripCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.tripCardLeft}>
        <Text style={styles.tripCardEmoji}>{isActive ? '✈️' : '✅'}</Text>
      </View>
      <View style={styles.tripCardInfo}>
        <Text style={styles.tripCardName} numberOfLines={1}>{trip.name}</Text>
        <Text style={styles.tripCardDate}>{dateStr}</Text>
      </View>
      <View style={[styles.tripStatusDot, isActive ? styles.tripStatusActive : styles.tripStatusDone]} />
      <Text style={styles.tripCardArrow}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 100 },

  screenTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  screenSub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 24 },

  listLabel: {
    fontSize: 10, fontWeight: '700', color: COLORS.textSecondary,
    letterSpacing: 1.5, marginBottom: 10, marginTop: 8,
  },

  /* ── Trip Card ──────────────────────────────────────────────── */
  tripCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 14,
    padding: 16, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  tripCardLeft: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.surfaceHigh, alignItems: 'center',
    justifyContent: 'center', marginRight: 12,
  },
  tripCardEmoji: { fontSize: 18 },
  tripCardInfo: { flex: 1 },
  tripCardName: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  tripCardDate: { fontSize: 12, color: COLORS.textSecondary },
  tripStatusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  tripStatusActive: { backgroundColor: COLORS.success },
  tripStatusDone: { backgroundColor: COLORS.textSecondary },
  tripCardArrow: { fontSize: 22, color: COLORS.textSecondary, fontWeight: '300' },

  /* ── Empty Trips ────────────────────────────────────────────── */
  emptyTrips: { alignItems: 'center', paddingVertical: 60 },
  emptyTripsEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTripsTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  emptyTripsText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },

  /* ── Detail Header ──────────────────────────────────────────── */
  detailHeader: {
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { marginBottom: 8 },
  backText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
  detailHeaderInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusActive: { backgroundColor: `${COLORS.success}20` },
  statusCompleted: { backgroundColor: `${COLORS.textSecondary}20` },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusTextActive: { color: COLORS.success },
  statusTextCompleted: { color: COLORS.textSecondary },

  /* ── Hero Card ──────────────────────────────────────────────── */
  heroCard: { borderRadius: 20, marginBottom: 16, borderWidth: 1, borderColor: COLORS.glassBorder, overflow: 'hidden' },
  heroAccent: { height: 2 },
  heroBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  heroLabel: { fontSize: 10, color: COLORS.textSecondary, letterSpacing: 2, fontWeight: '700', marginBottom: 8 },
  heroAmount: { fontSize: 36, fontWeight: '800', letterSpacing: -0.5 },
  countBadge: {
    alignItems: 'center', backgroundColor: COLORS.surfaceHigher,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  countText: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  countLabel: { fontSize: 10, color: COLORS.textSecondary, letterSpacing: 0.5, marginTop: 2 },

  /* ── Action Buttons ─────────────────────────────────────────── */
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, borderWidth: 1,
    backgroundColor: COLORS.surface, gap: 6,
  },
  actionBtnIcon: { fontSize: 14 },
  actionBtnText: { fontSize: 13, fontWeight: '700' },

  /* ── Sections & Transactions ────────────────────────────────── */
  sectionTitle: {
    fontSize: 10, fontWeight: '700', color: COLORS.textSecondary,
    letterSpacing: 1.5, marginBottom: 12, marginTop: 16,
  },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 36, marginBottom: 12 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },

  transactionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  transactionCardWrap: { flex: 1 },
  receiptBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.surfaceHigh, alignItems: 'center',
    justifyContent: 'center', marginLeft: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  receiptBtnIcon: { fontSize: 18 },
  receiptBtnAttached: { borderColor: `${COLORS.success}50`, backgroundColor: `${COLORS.success}15` },

  /* ── FAB ────────────────────────────────────────────────────── */
  fab: {
    position: 'absolute', right: 20, bottom: 20,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.reimbursementColor,
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30,
    elevation: 8, shadowColor: COLORS.reimbursementColor,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
  },
  fabIcon: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginRight: 6 },
  fabText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, letterSpacing: 0.3 },

  /* ── Trip Name Input ────────────────────────────────────────── */
  tripNameInput: {
    backgroundColor: COLORS.glass, borderRadius: 16,
    paddingHorizontal: 20, paddingVertical: 14,
    fontSize: 16, fontWeight: '600', color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.glassBorder, marginBottom: 24,
  },
  createTripBtn: { borderRadius: 30, overflow: 'hidden', marginBottom: 12 },
  createTripBtnGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 30 },
  createTripBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  /* ── Receipt Modal ──────────────────────────────────────────── */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#131318', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 20 },
  modalOption: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surfaceHigh, borderRadius: 14,
    padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, gap: 14,
  },
  modalOptionIcon: { fontSize: 22 },
  modalOptionText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  modalCancel: { alignItems: 'center', padding: 14, marginTop: 6 },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },

  /* ── Add Expense Modal ──────────────────────────────────────── */
  addModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  addModalSheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: COLORS.glassBorder, borderBottomWidth: 0,
  },
  addModalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.surfaceHigher, alignSelf: 'center', marginBottom: 20 },
  addModalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  addModalSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 24 },
  addModalLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5, marginBottom: 8 },

  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.glass, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.glassBorder, gap: 6,
  },
  categoryChipActive: { borderColor: COLORS.reimbursementColor, backgroundColor: `${COLORS.reimbursementColor}15` },
  categoryChipIcon: { fontSize: 16 },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  categoryChipTextActive: { color: COLORS.reimbursementColor },

  addModalAmountRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.glass, borderRadius: 16, paddingHorizontal: 20,
    borderWidth: 1, borderColor: COLORS.glassBorder, marginBottom: 20,
  },
  addModalCurrency: { fontSize: 24, fontWeight: '800', color: COLORS.reimbursementColor, marginRight: 4 },
  addModalAmountInput: { flex: 1, fontSize: 28, fontWeight: '800', color: COLORS.text, paddingVertical: 14 },
  addModalDescInput: {
    backgroundColor: COLORS.glass, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14,
    fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.glassBorder, marginBottom: 24,
  },
  addModalSaveBtn: { borderRadius: 30, overflow: 'hidden', marginBottom: 12 },
  addModalSaveBtnGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 30 },
  addModalSaveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  addModalCancelBtn: { paddingVertical: 12, alignItems: 'center' },
  addModalCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
});
