import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { InvestmentItem } from '../models/types';
import {
  getInvestments, saveInvestment, deleteInvestment,
  hasInvestmentsOnboarded, setInvestmentsOnboarded,
} from '../services/StorageService';
import { COLORS, formatCurrency, generateId } from '../utils/helpers';

function calcNextBillingDate(billingDay: number, cycle: 'monthly' | 'yearly' | 'one-time'): string {
  if (cycle === 'one-time') return '';
  const now = new Date();
  const day = Math.min(billingDay, 28);
  let next = new Date(now.getFullYear(), now.getMonth(), day);
  if (next <= now) {
    next = cycle === 'monthly'
      ? new Date(now.getFullYear(), now.getMonth() + 1, day)
      : new Date(now.getFullYear() + 1, now.getMonth(), day);
  }
  return next.toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  if (!dateStr) return -1;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function InvestmentsScreen() {
  const [items, setItems] = useState<InvestmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCycle, setFormCycle] = useState<'monthly' | 'yearly' | 'one-time'>('monthly');
  const [formDay, setFormDay] = useState('');
  const [editingItem, setEditingItem] = useState<InvestmentItem | null>(null);

  const load = useCallback(async () => {
    const inv = await getInvestments();
    setItems(inv.filter(i => i.active));
    const onboarded = await hasInvestmentsOnboarded();
    if (!onboarded && inv.length === 0) setShowOnboarding(true);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalMonthly = items.reduce((sum, item) => {
    if (item.cycle === 'one-time') return sum;
    if (item.cycle === 'monthly') return sum + item.amount;
    return sum + item.amount / 12;
  }, 0);

  const handleSave = async () => {
    const name = formName.trim();
    const amount = parseFloat(formAmount);
    const day = parseInt(formDay) || new Date().getDate();

    if (!name) { Alert.alert('Required', 'Enter investment name'); return; }
    if (!amount || amount <= 0) { Alert.alert('Required', 'Enter valid amount'); return; }

    const item: InvestmentItem = {
      id: editingItem?.id || generateId(),
      name,
      amount,
      cycle: formCycle,
      billingDay: formCycle !== 'one-time' ? day : undefined,
      nextBillingDate: calcNextBillingDate(day, formCycle),
      source: 'manual',
      confirmed: true,
      active: true,
      createdAt: editingItem?.createdAt || Date.now(),
    };

    await saveInvestment(item);
    resetForm();
    load();
  };

  const resetForm = () => {
    setFormName(''); setFormAmount(''); setFormCycle('monthly'); setFormDay('');
    setEditingItem(null); setShowAddModal(false);
  };

  const handleEdit = (item: InvestmentItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormAmount(String(item.amount));
    setFormCycle(item.cycle);
    setFormDay(item.billingDay ? String(item.billingDay) : '');
    setShowAddModal(true);
  };

  const handleDelete = (item: InvestmentItem) => {
    Alert.alert('Remove Investment', `Remove ${item.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteInvestment(item.id); load(); } },
    ]);
  };

  const handleOnboardingDismiss = async () => {
    await setInvestmentsOnboarded();
    setShowOnboarding(false);
    setShowAddModal(true);
  };

  const renderItem = ({ item }: { item: InvestmentItem }) => {
    const days = daysUntil(item.nextBillingDate || '');

    return (
      <TouchableOpacity style={styles.card} onPress={() => handleEdit(item)} onLongPress={() => handleDelete(item)} activeOpacity={0.7}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardCycle}>
            {item.cycle === 'monthly' ? 'Monthly SIP' : item.cycle === 'yearly' ? 'Yearly' : 'One-time'}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
          {days >= 0 && item.cycle !== 'one-time' && (
            <Text style={[styles.cardDays, days <= 3 && { color: COLORS.danger }]}>
              {days === 0 ? 'Due today' : `${days}d left`}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={['#101A14', '#0A100C', COLORS.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={[styles.headerAccent, { backgroundColor: COLORS.success }]} />
        <Text style={styles.headerTitle}>Investments</Text>
        <Text style={styles.headerSub}>All your investments in one place</Text>
        {items.length > 0 && (
          <View style={styles.headerStats}>
            <View>
              <Text style={styles.headerStatLabel}>MONTHLY</Text>
              <Text style={[styles.headerStatValue, { color: COLORS.success }]}>{formatCurrency(totalMonthly)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.headerStatLabel}>ACTIVE</Text>
              <Text style={[styles.headerStatValue, { color: COLORS.success }]}>{items.length}</Text>
            </View>
          </View>
        )}
      </LinearGradient>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📈</Text>
              <Text style={styles.emptyText}>No investments yet</Text>
              <Text style={styles.emptySub}>Tap + to add your first investment</Text>
            </View>
          ) : null
        }
      />

      <TouchableOpacity style={[styles.fab, { backgroundColor: COLORS.success }]} onPress={() => setShowAddModal(true)} activeOpacity={0.8}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Onboarding */}
      <Modal visible={showOnboarding} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.onboardingContent}>
            <Text style={styles.onboardingEmoji}>📈</Text>
            <Text style={styles.onboardingTitle}>All your investments in one place</Text>
            <Text style={styles.onboardingSub}>
              Enter once, we'll take care of all the tracking hereafter.
              {'\n\n'}Track SIPs, mutual funds, and all recurring investments.
            </Text>
            <TouchableOpacity style={styles.onboardingBtn} onPress={handleOnboardingDismiss} activeOpacity={0.8}>
              <LinearGradient colors={[COLORS.success, '#2A9A6A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.onboardingBtnGrad}>
                <Text style={styles.onboardingBtnText}>Add my investments</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setInvestmentsOnboarded(); setShowOnboarding(false); }} style={{ padding: 12 }}>
              <Text style={styles.onboardingSkip}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add/Edit Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={resetForm}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.formContainer}>
            <View style={styles.formHandle} />
            <Text style={styles.formTitle}>{editingItem ? 'Edit Investment' : 'Add Investment'}</Text>

            <TextInput style={styles.input} value={formName} onChangeText={setFormName}
              placeholder="Investment name (e.g. Zerodha SIP)" placeholderTextColor={COLORS.textLight} selectionColor={COLORS.primary} />
            <TextInput style={styles.input} value={formAmount} onChangeText={setFormAmount}
              placeholder="Amount" placeholderTextColor={COLORS.textLight} keyboardType="numeric" selectionColor={COLORS.primary} />

            <View style={styles.cycleRow}>
              {(['monthly', 'yearly', 'one-time'] as const).map(c => (
                <TouchableOpacity key={c} style={[styles.cycleBtn, formCycle === c && styles.cycleBtnActive]} onPress={() => setFormCycle(c)}>
                  <Text style={[styles.cycleBtnText, formCycle === c && styles.cycleBtnTextActive]}>
                    {c === 'monthly' ? 'Monthly' : c === 'yearly' ? 'Yearly' : 'One-time'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {formCycle !== 'one-time' && (
              <TextInput style={styles.input} value={formDay} onChangeText={setFormDay}
                placeholder="Debit day of month (1-31)" placeholderTextColor={COLORS.textLight} keyboardType="numeric" selectionColor={COLORS.primary} />
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <LinearGradient colors={[COLORS.success, '#2A9A6A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>{editingItem ? 'Update' : 'Add Investment'}</Text>
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
  list: { padding: 16, paddingTop: 8, paddingBottom: 100 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surfaceHigh, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
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
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 8 },
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
  formContainer: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: COLORS.glassBorder, borderBottomWidth: 0 },
  formHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.surfaceHigher, alignSelf: 'center', marginBottom: 20 },
  formTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: COLORS.glass, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.glassBorder, marginBottom: 12 },
  cycleRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  cycleBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder, alignItems: 'center' },
  cycleBtnActive: { backgroundColor: `${COLORS.success}20`, borderColor: COLORS.success },
  cycleBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  cycleBtnTextActive: { color: COLORS.success },
  saveBtn: { borderRadius: 30, overflow: 'hidden', marginTop: 8, marginBottom: 12 },
  saveBtnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 30 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
});
