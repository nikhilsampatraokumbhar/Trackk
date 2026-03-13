import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { EMIItem } from '../models/types';
import {
  getEMIs, saveEMI, deleteEMI,
  hasEMIsOnboarded, setEMIsOnboarded,
} from '../services/StorageService';
import { scanHistoricalSMS, checkEMICompletions } from '../services/AutoDetectionService';
import { checkSmsPermission, requestSmsPermission } from '../services/SmsService';
import { COLORS, formatCurrency, generateId } from '../utils/helpers';

function calcNextBillingDate(billingDay: number): string {
  const now = new Date();
  const day = Math.min(billingDay, 28);
  let next = new Date(now.getFullYear(), now.getMonth(), day);
  if (next <= now) {
    next = new Date(now.getFullYear(), now.getMonth() + 1, day);
  }
  return next.toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function EMIsScreen() {
  const [items, setItems] = useState<EMIItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResultText, setScanResultText] = useState('');

  // EMI completion celebration
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationEMI, setCelebrationEMI] = useState('');

  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formTotalMonths, setFormTotalMonths] = useState('');
  const [formMonthsPaid, setFormMonthsPaid] = useState('');
  const [formDay, setFormDay] = useState('');
  const [editingItem, setEditingItem] = useState<EMIItem | null>(null);

  const load = useCallback(async () => {
    // Check for completed EMIs first
    const completed = await checkEMICompletions();
    if (completed.length > 0) {
      setCelebrationEMI(completed[0].name);
      setShowCelebration(true);
    }

    const emis = await getEMIs();
    const active = emis.filter(e => e.active);
    active.sort((a, b) => (a.confirmed === b.confirmed ? 0 : a.confirmed ? -1 : 1));
    setItems(active);
    const onboarded = await hasEMIsOnboarded();
    if (!onboarded && emis.filter(e => e.confirmed).length === 0) setShowOnboarding(true);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalMonthly = items.reduce((sum, item) => sum + item.amount, 0);

  const handleSyncSMS = async () => {
    const hasPerm = await checkSmsPermission();
    if (!hasPerm) {
      const granted = await requestSmsPermission();
      if (!granted) {
        Alert.alert(
          'SMS Permission Required',
          'We need SMS access to scan your transaction history and find EMIs automatically.',
          [
            { text: 'Add Manually', onPress: () => { setShowOnboarding(false); setShowAddModal(true); } },
            { text: 'Try Again', onPress: handleSyncSMS },
          ],
        );
        return;
      }
    }

    setScanning(true);
    setScanResultText('');
    try {
      const result = await scanHistoricalSMS('emis');
      await setEMIsOnboarded();
      setShowOnboarding(false);

      if (result.emis.length > 0) {
        setScanResultText(`Found ${result.emis.length} EMI${result.emis.length > 1 ? 's' : ''}`);
      } else {
        setScanResultText('No EMIs found in your SMS history');
        setShowAddModal(true);
      }
      await load();
    } catch (e) {
      Alert.alert('Scan Failed', 'Could not scan SMS history. You can add EMIs manually.');
      setShowOnboarding(false);
      setShowAddModal(true);
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    const name = formName.trim();
    const amount = parseFloat(formAmount);
    const totalMonths = parseInt(formTotalMonths) || 0;
    const monthsPaid = parseInt(formMonthsPaid) || 0;
    const day = parseInt(formDay) || new Date().getDate();

    if (!name) { Alert.alert('Required', 'Enter EMI name'); return; }
    if (!amount || amount <= 0) { Alert.alert('Required', 'Enter valid amount'); return; }
    if (totalMonths <= 0) { Alert.alert('Required', 'Enter total months'); return; }

    const item: EMIItem = {
      id: editingItem?.id || generateId(),
      name,
      amount,
      totalMonths,
      monthsPaid,
      monthsLeft: Math.max(totalMonths - monthsPaid, 0),
      billingDay: day,
      nextBillingDate: calcNextBillingDate(day),
      source: 'manual',
      confirmed: true,
      active: true,
      createdAt: editingItem?.createdAt || Date.now(),
    };

    await saveEMI(item);
    resetForm();
    load();
  };

  const resetForm = () => {
    setFormName(''); setFormAmount(''); setFormTotalMonths(''); setFormMonthsPaid(''); setFormDay('');
    setEditingItem(null); setShowAddModal(false);
  };

  const handleEdit = (item: EMIItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormAmount(String(item.amount));
    setFormTotalMonths(String(item.totalMonths));
    setFormMonthsPaid(String(item.monthsPaid));
    setFormDay(String(item.billingDay));
    setShowAddModal(true);
  };

  const handleDelete = (item: EMIItem) => {
    Alert.alert('Remove EMI', `Remove ${item.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteEMI(item.id); load(); } },
    ]);
  };

  const handleConfirmAutoDetected = async (item: EMIItem) => {
    item.confirmed = true;
    await saveEMI(item);
    load();
  };

  const handleDismissAutoDetected = async (item: EMIItem) => {
    await deleteEMI(item.id);
    load();
  };

  const handleOnboardingDismiss = async () => {
    await setEMIsOnboarded();
    setShowOnboarding(false);
    setShowAddModal(true);
  };

  const renderItem = ({ item }: { item: EMIItem }) => {
    const days = daysUntil(item.nextBillingDate);
    const progress = item.totalMonths > 0 ? (item.monthsPaid / item.totalMonths) * 100 : 0;
    const isAutoDetected = !item.confirmed && item.source === 'auto';

    return (
      <View>
        {isAutoDetected && (
          <View style={styles.autoDetectedBanner}>
            <Text style={styles.autoDetectedText}>Auto-detected from your transactions</Text>
          </View>
        )}
        <TouchableOpacity style={[styles.card, isAutoDetected && styles.cardAutoDetected]} onPress={() => isAutoDetected ? handleConfirmAutoDetected(item) : handleEdit(item)} onLongPress={() => handleDelete(item)} activeOpacity={0.7}>
          <View style={styles.cardTop}>
            <View style={styles.cardLeft}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardCycle}>{item.monthsLeft} months remaining</Text>
            </View>
            <View style={styles.cardRight}>
              <Text style={styles.cardAmount}>{formatCurrency(item.amount)}/mo</Text>
              {isAutoDetected ? (
                <View style={styles.autoDetectedActions}>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => handleConfirmAutoDetected(item)}>
                    <Text style={styles.confirmBtnText}>Confirm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dismissBtn} onPress={() => handleDismissAutoDetected(item)}>
                    <Text style={styles.dismissBtnText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[styles.cardDays, days <= 3 && { color: COLORS.danger }]}>
                  {days === 0 ? 'Due today' : `${days}d left`}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>{item.monthsPaid}/{item.totalMonths} months paid</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={['#1A1018', '#100A0E', COLORS.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={[styles.headerAccent, { backgroundColor: COLORS.warning }]} />
        <Text style={styles.headerTitle}>EMIs</Text>
        <Text style={styles.headerSub}>All your EMIs in one place</Text>
        {items.length > 0 && (
          <View style={styles.headerStats}>
            <View>
              <Text style={styles.headerStatLabel}>MONTHLY</Text>
              <Text style={[styles.headerStatValue, { color: COLORS.warning }]}>{formatCurrency(totalMonthly)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.headerStatLabel}>ACTIVE</Text>
              <Text style={[styles.headerStatValue, { color: COLORS.warning }]}>{items.length}</Text>
            </View>
          </View>
        )}
      </LinearGradient>

      {scanResultText ? (
        <View style={styles.scanResultBar}>
          <Text style={styles.scanResultText}>{scanResultText}</Text>
          <TouchableOpacity onPress={() => setScanResultText('')}>
            <Text style={styles.scanResultDismiss}>OK</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🏦</Text>
              <Text style={styles.emptyText}>No EMIs yet</Text>
              <Text style={styles.emptySub}>Tap + to add your first EMI</Text>
            </View>
          ) : null
        }
      />

      <TouchableOpacity style={[styles.fab, { backgroundColor: COLORS.warning }]} onPress={() => setShowAddModal(true)} activeOpacity={0.8}>
        <Text style={[styles.fabIcon, { color: '#1A1018' }]}>+</Text>
      </TouchableOpacity>

      {/* EMI Completion Celebration */}
      <Modal visible={showCelebration} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.celebrationContent}>
            <Text style={styles.celebrationEmoji}>🎉</Text>
            <Text style={styles.celebrationTitle}>Bravoooo!</Text>
            <Text style={styles.celebrationSub}>
              Your {celebrationEMI} EMI is fully paid!{'\n'}One less thing to worry about.
            </Text>
            <Text style={styles.celebrationBadge}>EMI CLOSED</Text>
            <TouchableOpacity style={styles.celebrationBtn} onPress={() => setShowCelebration(false)} activeOpacity={0.8}>
              <LinearGradient colors={[COLORS.success, '#2A9A6A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.celebrationBtnGrad}>
                <Text style={styles.celebrationBtnText}>Amazing!</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Onboarding — One-time sync */}
      <Modal visible={showOnboarding} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.onboardingContent}>
            <Text style={styles.onboardingEmoji}>🏦</Text>
            <Text style={styles.onboardingTitle}>Let's get all your EMIs</Text>
            <Text style={styles.onboardingSub}>
              We'll scan your SMS history (past 1 year) to find all EMI payments automatically.
              {'\n\n'}Track loan repayments, auto EMIs, and never miss a payment.
            </Text>
            {scanning ? (
              <View style={styles.scanningContainer}>
                <ActivityIndicator size="large" color={COLORS.warning} />
                <Text style={styles.scanningText}>Scanning your messages...</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.onboardingBtn} onPress={handleSyncSMS} activeOpacity={0.8}>
                  <LinearGradient colors={[COLORS.warning, '#C8A052']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.onboardingBtnGrad}>
                    <Text style={[styles.onboardingBtnText, { color: '#1A1018' }]}>Scan & Find EMIs</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleOnboardingDismiss} style={{ padding: 12 }}>
                  <Text style={styles.onboardingSkip}>Add manually instead</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Add/Edit Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={resetForm}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
          <View style={styles.formContainer}>
            <View style={styles.formHandle} />
            <Text style={styles.formTitle}>{editingItem ? 'Edit EMI' : 'Add EMI'}</Text>

            <TextInput style={styles.input} value={formName} onChangeText={setFormName}
              placeholder="EMI name (e.g. Car Loan)" placeholderTextColor={COLORS.textLight} selectionColor={COLORS.primary} />
            <TextInput style={styles.input} value={formAmount} onChangeText={setFormAmount}
              placeholder="Monthly amount" placeholderTextColor={COLORS.textLight} keyboardType="numeric" selectionColor={COLORS.primary} />
            <TextInput style={styles.input} value={formTotalMonths} onChangeText={setFormTotalMonths}
              placeholder="Total months (e.g. 36)" placeholderTextColor={COLORS.textLight} keyboardType="numeric" selectionColor={COLORS.primary} />
            <TextInput style={styles.input} value={formMonthsPaid} onChangeText={setFormMonthsPaid}
              placeholder="Months already paid (e.g. 12)" placeholderTextColor={COLORS.textLight} keyboardType="numeric" selectionColor={COLORS.primary} />
            <TextInput style={styles.input} value={formDay} onChangeText={setFormDay}
              placeholder="EMI debit day of month (1-31)" placeholderTextColor={COLORS.textLight} keyboardType="numeric" selectionColor={COLORS.primary} />

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <LinearGradient colors={[COLORS.warning, '#C8A052']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                <Text style={[styles.saveBtnText, { color: '#1A1018' }]}>{editingItem ? 'Update' : 'Add EMI'}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { borderRadius: 20, padding: 24, margin: 16, marginBottom: 8, borderWidth: 1, borderColor: COLORS.glassBorder, overflow: 'hidden' },
  headerAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  headerSub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 },
  headerStats: { flexDirection: 'row', justifyContent: 'space-between' },
  headerStatLabel: { fontSize: 9, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5, marginBottom: 4 },
  headerStatValue: { fontSize: 22, fontWeight: '800' },

  scanResultBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: `${COLORS.warning}15`, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  scanResultText: { fontSize: 13, fontWeight: '600', color: COLORS.warning, flex: 1 },
  scanResultDismiss: { fontSize: 13, fontWeight: '700', color: COLORS.warning, marginLeft: 12 },

  list: { padding: 16, paddingTop: 8, paddingBottom: 100 },
  card: { backgroundColor: COLORS.surfaceHigh, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  cardAutoDetected: { borderColor: `${COLORS.warning}40`, borderStyle: 'dashed' as const },
  autoDetectedBanner: { backgroundColor: `${COLORS.warning}12`, paddingHorizontal: 12, paddingVertical: 4, borderTopLeftRadius: 12, borderTopRightRadius: 12, marginBottom: -4 },
  autoDetectedText: { fontSize: 10, fontWeight: '700', color: COLORS.warning, letterSpacing: 0.3 },
  autoDetectedActions: { flexDirection: 'row', gap: 6 },
  confirmBtn: { backgroundColor: `${COLORS.success}20`, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  confirmBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.success },
  dismissBtn: { backgroundColor: COLORS.glass, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  dismissBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardLeft: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  cardCycle: { fontSize: 12, color: COLORS.textSecondary },
  cardRight: { alignItems: 'flex-end' },
  cardAmount: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  cardDays: { fontSize: 12, color: COLORS.warning, fontWeight: '600' },
  progressTrack: { height: 6, backgroundColor: COLORS.glassHigh, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: COLORS.warning },
  progressText: { fontSize: 11, color: COLORS.textSecondary },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  emptySub: { fontSize: 13, color: COLORS.textSecondary },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  fabIcon: { fontSize: 28, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' },

  // Celebration
  celebrationContent: { backgroundColor: COLORS.surface, borderRadius: 28, padding: 32, margin: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder },
  celebrationEmoji: { fontSize: 64, marginBottom: 16 },
  celebrationTitle: { fontSize: 28, fontWeight: '800', color: COLORS.success, textAlign: 'center', marginBottom: 8 },
  celebrationSub: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 16 },
  celebrationBadge: { backgroundColor: `${COLORS.success}20`, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 24 },
  celebrationBtn: { borderRadius: 30, overflow: 'hidden', width: '100%' },
  celebrationBtnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 30 },
  celebrationBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // Onboarding
  onboardingContent: { backgroundColor: COLORS.surface, borderRadius: 28, padding: 32, margin: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder },
  onboardingEmoji: { fontSize: 48, marginBottom: 16 },
  onboardingTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 12 },
  onboardingSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  onboardingBtn: { borderRadius: 30, overflow: 'hidden', width: '100%', marginBottom: 8 },
  onboardingBtnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 30 },
  onboardingBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  onboardingSkip: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  scanningContainer: { alignItems: 'center', paddingVertical: 20 },
  scanningText: { fontSize: 14, color: COLORS.textSecondary, marginTop: 12 },

  formContainer: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: COLORS.glassBorder, borderBottomWidth: 0 },
  formHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.surfaceHigher, alignSelf: 'center', marginBottom: 20 },
  formTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: COLORS.glass, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.glassBorder, marginBottom: 12 },
  saveBtn: { borderRadius: 30, overflow: 'hidden', marginTop: 8, marginBottom: 12 },
  saveBtnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 30 },
  saveBtnText: { fontSize: 15, fontWeight: '700' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
});
