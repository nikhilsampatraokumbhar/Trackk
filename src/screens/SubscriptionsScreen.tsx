import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { UserSubscriptionItem } from '../models/types';
import {
  getSubscriptions, saveSubscription, deleteSubscription,
  hasSubscriptionsOnboarded, setSubscriptionsOnboarded,
} from '../services/StorageService';
import { checkSharedSubscriptionStatus, scanHistoricalSMS } from '../services/AutoDetectionService';
import { checkSmsPermission, requestSmsPermission } from '../services/SmsService';
import { COLORS, formatCurrency, generateId } from '../utils/helpers';
import EmptyState from '../components/EmptyState';

/** Calculate next billing date from a billing day and cycle */
function calcNextBillingDate(billingDay: number, cycle: 'monthly' | 'yearly'): string {
  const now = new Date();
  let next: Date;

  if (cycle === 'monthly') {
    const day = Math.min(billingDay, 28);
    next = new Date(now.getFullYear(), now.getMonth(), day);
    if (next <= now) {
      next = new Date(now.getFullYear(), now.getMonth() + 1, day);
    }
  } else {
    const day = Math.min(billingDay, 28);
    next = new Date(now.getFullYear(), now.getMonth(), day);
    if (next <= now) {
      next = new Date(now.getFullYear() + 1, now.getMonth(), day);
    }
  }
  return next.toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function SubscriptionsScreen() {
  const [items, setItems] = useState<UserSubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResultText, setScanResultText] = useState('');

  // Add form
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCycle, setFormCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [formDay, setFormDay] = useState('');
  const [formShared, setFormShared] = useState(false);
  const [formSharedCount, setFormSharedCount] = useState('');
  const [editingItem, setEditingItem] = useState<UserSubscriptionItem | null>(null);

  const load = useCallback(async () => {
    const subs = await getSubscriptions();
    const active = subs.filter(s => s.active);
    active.sort((a, b) => {
      if (a.confirmed === b.confirmed) return 0;
      return a.confirmed ? -1 : 1;
    });
    setItems(active);

    const onboarded = await hasSubscriptionsOnboarded();
    if (!onboarded && subs.filter(s => s.confirmed).length === 0) {
      setShowOnboarding(true);
    }

    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalMonthly = items.reduce((sum, item) => {
    if (item.cycle === 'monthly') return sum + item.amount;
    return sum + item.amount / 12;
  }, 0);

  const handleSyncSMS = async () => {
    // Check SMS permission
    const hasPerm = await checkSmsPermission();
    if (!hasPerm) {
      const granted = await requestSmsPermission();
      if (!granted) {
        Alert.alert(
          'SMS Permission Required',
          'We need SMS access to scan your transaction history and find subscriptions automatically.',
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
      const result = await scanHistoricalSMS('subscriptions');
      await setSubscriptionsOnboarded();
      setShowOnboarding(false);

      if (result.subscriptions.length > 0) {
        setScanResultText(`Found ${result.subscriptions.length} subscription${result.subscriptions.length > 1 ? 's' : ''}`);
      } else {
        setScanResultText('No subscriptions found in your SMS history');
        setShowAddModal(true);
      }
      await load();
    } catch (e) {
      Alert.alert('Scan Failed', 'Could not scan SMS history. You can add subscriptions manually.');
      setShowOnboarding(false);
      setShowAddModal(true);
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    const name = formName.trim();
    const amount = parseFloat(formAmount);
    const day = parseInt(formDay) || new Date().getDate();

    if (!name) { Alert.alert('Required', 'Enter subscription name'); return; }
    if (!amount || amount <= 0) { Alert.alert('Required', 'Enter valid amount'); return; }
    if (day < 1 || day > 31) { Alert.alert('Invalid', 'Billing day must be 1-31'); return; }

    const item: UserSubscriptionItem = {
      id: editingItem?.id || generateId(),
      name,
      amount,
      cycle: formCycle,
      billingDay: day,
      nextBillingDate: calcNextBillingDate(day, formCycle),
      isShared: formShared,
      sharedCount: formShared ? parseInt(formSharedCount) || 2 : undefined,
      source: 'manual',
      confirmed: true,
      active: true,
      createdAt: editingItem?.createdAt || Date.now(),
    };

    await saveSubscription(item);
    resetForm();
    load();
  };

  const resetForm = () => {
    setFormName('');
    setFormAmount('');
    setFormCycle('monthly');
    setFormDay('');
    setFormShared(false);
    setFormSharedCount('');
    setEditingItem(null);
    setShowAddModal(false);
  };

  const handleEdit = (item: UserSubscriptionItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormAmount(String(item.amount));
    setFormCycle(item.cycle);
    setFormDay(String(item.billingDay));
    setFormShared(item.isShared);
    setFormSharedCount(item.sharedCount ? String(item.sharedCount) : '');
    setShowAddModal(true);
  };

  const handleDelete = (item: UserSubscriptionItem) => {
    Alert.alert('Remove Subscription', `Remove ${item.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => { await deleteSubscription(item.id); load(); },
      },
    ]);
  };

  const handleOnboardingDismiss = async () => {
    await setSubscriptionsOnboarded();
    setShowOnboarding(false);
    setShowAddModal(true);
  };

  const handleConfirmAutoDetected = async (item: UserSubscriptionItem) => {
    item.confirmed = true;
    await saveSubscription(item);
    load();
  };

  const handleDismissAutoDetected = async (item: UserSubscriptionItem) => {
    await deleteSubscription(item.id);
    load();
  };

  const renderItem = ({ item }: { item: UserSubscriptionItem }) => {
    const days = daysUntil(item.nextBillingDate);
    const isUrgent = days <= 3;
    const isAutoDetected = !item.confirmed && item.source === 'auto';

    return (
      <View>
        {isAutoDetected && (
          <View style={styles.autoDetectedBanner}>
            <Text style={styles.autoDetectedText}>Auto-detected from your transactions</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.card, isAutoDetected && styles.cardAutoDetected]}
          onPress={() => isAutoDetected ? handleConfirmAutoDetected(item) : handleEdit(item)}
          onLongPress={() => handleDelete(item)}
          activeOpacity={0.7}
        >
          <View style={styles.cardLeft}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardCycle}>
              {item.cycle === 'monthly' ? 'Monthly' : 'Yearly'}
              {item.isShared ? ` (shared by ${item.sharedCount || 2})` : ''}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
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
              <Text style={[styles.cardDays, isUrgent && { color: COLORS.danger }]}>
                {days === 0 ? 'Due today' : `${days}d left`}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient
        colors={['#1A1210', '#100C0A', COLORS.background]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerAccent} />
        <Text style={styles.headerTitle}>Subscriptions</Text>
        <Text style={styles.headerSub}>All your subscriptions in one place</Text>
        {items.length > 0 && (
          <View style={styles.headerStats}>
            <View>
              <Text style={styles.headerStatLabel}>MONTHLY COST</Text>
              <Text style={styles.headerStatValue}>{formatCurrency(totalMonthly)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.headerStatLabel}>ACTIVE</Text>
              <Text style={styles.headerStatValue}>{items.length}</Text>
            </View>
          </View>
        )}
      </LinearGradient>

      {/* Scan result feedback */}
      {scanResultText ? (
        <View style={styles.scanResultBar}>
          <Text style={styles.scanResultText}>{scanResultText}</Text>
          <TouchableOpacity onPress={() => setScanResultText('')}>
            <Text style={styles.scanResultDismiss}>OK</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="🔄"
              title="No subscriptions yet"
              subtitle="Tap + to add your first subscription"
              accent={COLORS.personalColor}
            />
          ) : null
        }
      />

      {/* Add FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Onboarding Modal — One-time sync */}
      <Modal visible={showOnboarding} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.onboardingContent}>
            <Text style={styles.onboardingEmoji}>🔄</Text>
            <Text style={styles.onboardingTitle}>Let's get all your subscriptions</Text>
            <Text style={styles.onboardingSub}>
              We'll scan your SMS history (past 1 year) to find all recurring subscriptions automatically.
              {'\n\n'}Netflix, Spotify, YouTube Premium — we'll catch them all.
            </Text>
            {scanning ? (
              <View style={styles.scanningContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.scanningText}>Scanning your messages...</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.onboardingBtn} onPress={handleSyncSMS} activeOpacity={0.8}>
                  <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.onboardingBtnGrad}>
                    <Text style={styles.onboardingBtnText}>Scan & Find Subscriptions</Text>
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
            <Text style={styles.formTitle}>{editingItem ? 'Edit Subscription' : 'Add Subscription'}</Text>

            <TextInput
              style={styles.input}
              value={formName}
              onChangeText={setFormName}
              placeholder="Subscription name (e.g. Netflix)"
              placeholderTextColor={COLORS.textLight}
              selectionColor={COLORS.primary}
            />
            <TextInput
              style={styles.input}
              value={formAmount}
              onChangeText={setFormAmount}
              placeholder="Amount"
              placeholderTextColor={COLORS.textLight}
              keyboardType="numeric"
              selectionColor={COLORS.primary}
            />

            <View style={styles.cycleRow}>
              <TouchableOpacity
                style={[styles.cycleBtn, formCycle === 'monthly' && styles.cycleBtnActive]}
                onPress={() => setFormCycle('monthly')}
              >
                <Text style={[styles.cycleBtnText, formCycle === 'monthly' && styles.cycleBtnTextActive]}>Monthly</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cycleBtn, formCycle === 'yearly' && styles.cycleBtnActive]}
                onPress={() => setFormCycle('yearly')}
              >
                <Text style={[styles.cycleBtnText, formCycle === 'yearly' && styles.cycleBtnTextActive]}>Yearly</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              value={formDay}
              onChangeText={setFormDay}
              placeholder="Billing day of month (1-31)"
              placeholderTextColor={COLORS.textLight}
              keyboardType="numeric"
              selectionColor={COLORS.primary}
            />

            <TouchableOpacity
              style={styles.sharedToggle}
              onPress={() => setFormShared(!formShared)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, formShared && styles.checkboxActive]}>
                {formShared && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.sharedLabel}>Shared subscription (others may pay next month)</Text>
            </TouchableOpacity>

            {formShared && (
              <TextInput
                style={styles.input}
                value={formSharedCount}
                onChangeText={setFormSharedCount}
                placeholder="How many people share this?"
                placeholderTextColor={COLORS.textLight}
                keyboardType="numeric"
                selectionColor={COLORS.primary}
              />
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>{editingItem ? 'Update' : 'Add Subscription'}</Text>
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
  headerAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: COLORS.primary },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  headerSub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 },
  headerStats: { flexDirection: 'row', justifyContent: 'space-between' },
  headerStatLabel: { fontSize: 9, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5, marginBottom: 4 },
  headerStatValue: { fontSize: 22, fontWeight: '800', color: COLORS.primary },

  scanResultBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: `${COLORS.success}15`, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  scanResultText: { fontSize: 13, fontWeight: '600', color: COLORS.success, flex: 1 },
  scanResultDismiss: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginLeft: 12 },

  list: { padding: 16, paddingTop: 8, paddingBottom: 100 },

  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surfaceHigh, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  cardAutoDetected: { borderColor: `${COLORS.primary}40`, borderStyle: 'dashed' as const },
  autoDetectedBanner: { backgroundColor: `${COLORS.primary}12`, paddingHorizontal: 12, paddingVertical: 4, borderTopLeftRadius: 12, borderTopRightRadius: 12, marginBottom: -4 },
  autoDetectedText: { fontSize: 10, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.3 },
  autoDetectedActions: { flexDirection: 'row', gap: 6 },
  confirmBtn: { backgroundColor: `${COLORS.success}20`, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  confirmBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.success },
  dismissBtn: { backgroundColor: COLORS.glass, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  dismissBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  cardLeft: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  cardCycle: { fontSize: 12, color: COLORS.textSecondary },
  cardRight: { alignItems: 'flex-end' },
  cardAmount: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  cardDays: { fontSize: 12, color: COLORS.success, fontWeight: '600' },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  emptySub: { fontSize: 13, color: COLORS.textSecondary },

  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  fabIcon: { color: '#FFF', fontSize: 28, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },

  onboardingContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 32, paddingBottom: 40, alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder, borderBottomWidth: 0 },
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

  cycleRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  cycleBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder, alignItems: 'center' },
  cycleBtnActive: { backgroundColor: `${COLORS.primary}20`, borderColor: COLORS.primary },
  cycleBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  cycleBtnTextActive: { color: COLORS.primary },

  sharedToggle: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.textSecondary, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  sharedLabel: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },

  saveBtn: { borderRadius: 30, overflow: 'hidden', marginTop: 8, marginBottom: 12 },
  saveBtnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 30 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
});
