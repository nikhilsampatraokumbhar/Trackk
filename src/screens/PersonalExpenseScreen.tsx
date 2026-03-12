import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, SectionList, RefreshControl,
  TouchableOpacity, Alert, NativeModules, Platform, AppState,
  TextInput, ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticLight, hapticMedium, hapticSuccess } from '../utils/haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { useTracker } from '../store/TrackerContext';
import { getTransactions, saveTransaction, deleteTransaction } from '../services/StorageService';
import { Transaction, ParsedTransaction } from '../models/types';
import TrackerToggle from '../components/TrackerToggle';
import TransactionCard from '../components/TransactionCard';
import SuccessOverlay from '../components/SuccessOverlay';
import { HeroCardSkeleton, TransactionListSkeleton } from '../components/SkeletonLoader';
import AnimatedAmount from '../components/AnimatedAmount';
import UndoToast from '../components/UndoToast';
import ContextMenu, { ContextMenuItem } from '../components/ContextMenu';
import BottomSheet from '../components/BottomSheet';
import { COLORS, formatCurrency, groupByDate } from '../utils/helpers';
import { PERSONAL_CATEGORIES } from '../utils/categories';
import { isDevMode } from '../utils/devMode';
import { checkSmsPermission } from '../services/SmsService';
import { showTransactionNotification, requestNotificationPermission } from '../services/NotificationService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function PersonalExpenseScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { trackerState, togglePersonal, isListening, transactionVersion } = useTracker();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Manual expense modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Success overlay
  const [showSuccess, setShowSuccess] = useState(false);
  const [successAmount, setSuccessAmount] = useState('');

  // Undo toast
  const [undoState, setUndoState] = useState<{ visible: boolean; message: string; txn: Transaction | null }>({ visible: false, message: '', txn: null });

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; transaction: Transaction | null }>({ visible: false, transaction: null });

  // Staggered animation tracking
  const [hasAnimated, setHasAnimated] = useState(false);
  const itemAnims = useRef<Map<string, { translateY: Animated.Value; opacity: Animated.Value }>>(new Map());

  const getItemAnim = (id: string, index: number) => {
    if (!itemAnims.current.has(id)) {
      const translateY = new Animated.Value(hasAnimated ? 0 : 20);
      const opacity = new Animated.Value(hasAnimated ? 1 : 0);
      itemAnims.current.set(id, { translateY, opacity });

      if (!hasAnimated && index < 10) {
        setTimeout(() => {
          Animated.parallel([
            Animated.spring(translateY, { toValue: 0, friction: 8, tension: 80, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
          ]).start();
        }, index * 60);
      }
    }
    return itemAnims.current.get(id)!;
  };

  const load = useCallback(async () => {
    const txns = await getTransactions('personal');
    setTransactions(txns.sort((a, b) => b.timestamp - a.timestamp));
    setLoading(false);
    setTimeout(() => setHasAnimated(true), 800);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load, transactionVersion]));

  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') load();
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleAddExpense = async () => {
    const amount = parseFloat(addAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid', 'Please enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      const parsed: ParsedTransaction = {
        amount,
        type: 'debit',
        merchant: addDescription.trim() || undefined,
        rawMessage: `Manual entry: ${addDescription.trim() || 'Cash expense'} - ${amount}`,
        timestamp: Date.now(),
      };
      await saveTransaction(parsed, 'personal', user?.id || '');
      hapticSuccess();
      setShowAddModal(false);
      setSuccessAmount(formatCurrency(amount));
      setShowSuccess(true);
      setAddAmount('');
      setAddDescription('');
      await load();
    } catch {
      Alert.alert('Error', 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  };

  const selectCategory = (label: string) => { setAddDescription(label); };

  // Swipe-to-delete with undo
  const handleSwipeDelete = async (txn: Transaction) => {
    await deleteTransaction(txn.id);
    setUndoState({ visible: true, message: `Deleted: ${txn.description}`, txn });
    await load();
  };

  const handleUndo = async () => {
    if (undoState.txn) {
      const txn = undoState.txn;
      await saveTransaction(
        { amount: txn.amount, type: 'debit', merchant: txn.merchant, rawMessage: txn.rawMessage || '', timestamp: txn.timestamp },
        txn.trackerType, txn.userId, txn.groupId,
      );
      await load();
    }
    setUndoState({ visible: false, message: '', txn: null });
  };

  const getContextMenuItems = (txn: Transaction): ContextMenuItem[] => [
    { label: 'View Details', icon: '📋', onPress: () => nav.navigate('TransactionDetail', { transactionId: txn.id }) },
    { label: 'Delete', icon: '🗑️', destructive: true, onPress: () => handleSwipeDelete(txn) },
  ];

  const now = new Date();
  const thisMonth = transactions.filter(t => {
    const d = new Date(t.timestamp);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalMonthly = thisMonth.reduce((s, t) => s + t.amount, 0);
  const totalAll = transactions.reduce((s, t) => s + t.amount, 0);

  const sections = useMemo(() => groupByDate(transactions), [transactions]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <HeroCardSkeleton />
          <TransactionListSkeleton count={4} />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SectionList
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />
        }
        sections={sections}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.dateHeader}>
            <View style={styles.dateHeaderLine} />
            <Text style={styles.dateHeaderText}>{title}</Text>
            <View style={styles.dateHeaderLine} />
          </View>
        )}
        renderItem={({ item, index }) => {
          const anim = getItemAnim(item.id, index);
          return (
            <Animated.View style={{ transform: [{ translateY: anim.translateY }], opacity: anim.opacity }}>
              <TransactionCard
                transaction={item}
                onPress={() => nav.navigate('TransactionDetail', { transactionId: item.id })}
                onLongPress={() => setContextMenu({ visible: true, transaction: item })}
                onSwipeDelete={() => handleSwipeDelete(item)}
              />
            </Animated.View>
          );
        }}
        ListHeaderComponent={
          <>
            <TrackerToggle
              label="Personal Expenses"
              subtitle="Track daily spending from SMS"
              isActive={trackerState.personal}
              onToggle={() => { hapticLight(); togglePersonal(); }}
              color={COLORS.personalColor}
            />

            {Platform.OS === 'ios' && (
              <TouchableOpacity style={styles.iosSetupBanner} onPress={() => nav.navigate('IOSSetup' as any)} activeOpacity={0.7}>
                <Text style={styles.iosSetupEmoji}>📱</Text>
                <View style={styles.iosSetupContent}>
                  <Text style={styles.iosSetupTitle}>Set up iPhone automation</Text>
                  <Text style={styles.iosSetupSub}>Use iOS Shortcuts for automatic tracking</Text>
                </View>
                <Text style={styles.iosSetupArrow}>{'>'}</Text>
              </TouchableOpacity>
            )}

            {isDevMode() && trackerState.personal && Platform.OS === 'android' && (
              <View style={styles.debugBox}>
                <Text style={styles.debugTitle}>DIAGNOSTICS (DEV)</Text>
                <Text style={styles.debugText}>Listener: {isListening ? 'YES' : 'NO'}</Text>
                <Text style={styles.debugText}>SmsListenerModule: {NativeModules.SmsListenerModule ? 'OK' : 'MISSING'}</Text>
                <Text style={styles.debugText}>SmsAndroid: {NativeModules.SmsAndroid ? 'OK' : 'MISSING'}</Text>
                <TouchableOpacity style={styles.debugBtn} onPress={async () => {
                  const sms = await checkSmsPermission();
                  const notif = await requestNotificationPermission();
                  Alert.alert('Permissions', `SMS: ${sms ? 'GRANTED' : 'DENIED'}\nNotifications: ${notif ? 'GRANTED' : 'DENIED'}`);
                }}>
                  <Text style={styles.debugBtnText}>Check Permissions</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.debugBtn, { marginTop: 8 }]} onPress={async () => {
                  try {
                    await showTransactionNotification(
                      { amount: 1, type: 'debit', merchant: 'Test Merchant', bank: 'HDFC Bank', rawMessage: 'Test SMS message', timestamp: Date.now() },
                      [{ type: 'personal', id: 'personal', label: 'Personal' }],
                    );
                    Alert.alert('Success', 'Test notification sent!');
                  } catch (e: any) { Alert.alert('Error', e.message); }
                }}>
                  <Text style={styles.debugBtnText}>Send Test Notification</Text>
                </TouchableOpacity>
              </View>
            )}

            <LinearGradient colors={['#16121A', '#0A0A0F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={[styles.heroAccent, { backgroundColor: COLORS.personalColor }]} />
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>THIS MONTH</Text>
                  <AnimatedAmount value={totalMonthly} style={[styles.statValue, { color: COLORS.personalColor }]} />
                  <Text style={styles.statCount}>{thisMonth.length} transactions</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>ALL TIME</Text>
                  <AnimatedAmount value={totalAll} style={[styles.statValue, { color: COLORS.text }]} />
                  <Text style={styles.statCount}>{transactions.length} total</Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.quickAccessRow}>
              <TouchableOpacity style={styles.quickAccessCard} onPress={() => nav.navigate('Goals')} activeOpacity={0.8}>
                <View style={[styles.quickAccessIconWrap, { backgroundColor: `${COLORS.success}18`, borderColor: `${COLORS.success}30` }]}>
                  <Text style={styles.quickAccessIcon}>🎯</Text>
                </View>
                <Text style={styles.quickAccessTitle}>Savings Goals</Text>
                <Text style={styles.quickAccessSub}>Set targets & daily budgets</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickAccessCard} onPress={() => nav.navigate('Reimbursement')} activeOpacity={0.8}>
                <View style={[styles.quickAccessIconWrap, { backgroundColor: `${COLORS.reimbursementColor}18`, borderColor: `${COLORS.reimbursementColor}30` }]}>
                  <Text style={styles.quickAccessIcon}>🧾</Text>
                </View>
                <Text style={styles.quickAccessTitle}>Reimbursement</Text>
                <Text style={styles.quickAccessSub}>Track office expenses</Text>
              </TouchableOpacity>
            </View>

            {transactions.length === 0 && (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}><Text style={styles.emptyEmoji}>💳</Text></View>
                <Text style={styles.emptyTitle}>{trackerState.personal ? 'No expenses yet' : 'Start tracking'}</Text>
                <Text style={styles.emptyText}>{trackerState.personal ? 'Your expenses will show up here automatically' : 'Enable the tracker above or add manually'}</Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={transactions.length > 0 ? null : undefined}
      />

      {/* Add Expense FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => { hapticMedium(); setShowAddModal(true); }} activeOpacity={0.8}>
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>Add Expense</Text>
      </TouchableOpacity>

      {/* Add Expense Bottom Sheet */}
      <BottomSheet visible={showAddModal} onClose={() => { setShowAddModal(false); setAddAmount(''); setAddDescription(''); }}>
        <Text style={styles.addModalTitle}>Add Expense</Text>
        <Text style={styles.addModalSub}>Log a cash or missed expense</Text>

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

        <Text style={styles.addModalLabel}>QUICK PICK</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryScrollContent}>
          {PERSONAL_CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.label}
              style={[styles.categoryChip, addDescription === cat.label && styles.categoryChipActive]}
              onPress={() => { hapticLight(); selectCategory(cat.label); }}
              activeOpacity={0.7}
            >
              <Text style={styles.categoryIcon}>{cat.icon}</Text>
              <Text style={[styles.categoryLabel, addDescription === cat.label && styles.categoryLabelActive]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.addModalLabel}>OR DESCRIBE</Text>
        <TextInput
          style={styles.addModalDescInput}
          value={addDescription}
          onChangeText={setAddDescription}
          placeholder="e.g. Parking, Snacks, Subscription..."
          placeholderTextColor={COLORS.textLight}
          maxLength={200}
        />

        <TouchableOpacity style={[styles.addModalSaveBtn, saving && { opacity: 0.5 }]} onPress={handleAddExpense} disabled={saving} activeOpacity={0.8}>
          <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.addModalSaveBtnGradient}>
            <Text style={styles.addModalSaveBtnText}>{saving ? 'Saving...' : 'Save Expense'}</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={styles.addModalCancelBtn} onPress={() => { setShowAddModal(false); setAddAmount(''); setAddDescription(''); }}>
          <Text style={styles.addModalCancelText}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* Success overlay */}
      <SuccessOverlay visible={showSuccess} message="Expense saved" subMessage={successAmount} onDone={() => setShowSuccess(false)} color={COLORS.personalColor} />

      {/* Undo Toast */}
      <UndoToast visible={undoState.visible} message={undoState.message} onUndo={handleUndo} onDismiss={() => setUndoState({ visible: false, message: '', txn: null })} />

      {/* Context Menu */}
      <ContextMenu
        visible={contextMenu.visible}
        onClose={() => setContextMenu({ visible: false, transaction: null })}
        items={contextMenu.transaction ? getContextMenuItems(contextMenu.transaction) : []}
        title={contextMenu.transaction?.description}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 80 },

  dateHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 10 },
  dateHeaderLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dateHeaderText: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5, textTransform: 'uppercase', paddingHorizontal: 12 },

  heroCard: { borderRadius: 24, marginVertical: 16, borderWidth: 1, borderColor: COLORS.glassBorder, overflow: 'hidden' },
  heroAccent: { height: 2 },
  statsRow: { flexDirection: 'row', padding: 22 },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: COLORS.glassBorder, marginHorizontal: 16 },
  statLabel: { fontSize: 10, color: COLORS.textSecondary, letterSpacing: 2, fontWeight: '700', marginBottom: 8 },
  statValue: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  statCount: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },

  quickAccessRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickAccessCard: { flex: 1, backgroundColor: COLORS.glass, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: COLORS.glassBorder, alignItems: 'center' },
  quickAccessIconWrap: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  quickAccessIcon: { fontSize: 18 },
  quickAccessTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  quickAccessSub: { fontSize: 10, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 14 },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: COLORS.glass, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.glassBorder },
  emptyEmoji: { fontSize: 28 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19 },

  debugBox: { backgroundColor: COLORS.glass, borderRadius: 16, padding: 14, marginVertical: 10, borderWidth: 1, borderColor: `${COLORS.warning}30` },
  debugTitle: { fontSize: 10, fontWeight: '700', color: COLORS.warning, letterSpacing: 1.5, marginBottom: 8 },
  debugText: { fontSize: 12, color: COLORS.text, marginBottom: 4, fontFamily: 'monospace' },
  debugBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' as const, marginTop: 10 },
  debugBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  iosSetupBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 20, padding: 16, marginVertical: 10, borderWidth: 1, borderColor: `${COLORS.primary}20`, gap: 12 },
  iosSetupEmoji: { fontSize: 24 },
  iosSetupContent: { flex: 1 },
  iosSetupTitle: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  iosSetupSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  iosSetupArrow: { fontSize: 18, color: COLORS.textSecondary, fontWeight: '600' },

  fab: { position: 'absolute', right: 20, bottom: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.personalColor, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30, elevation: 8, shadowColor: COLORS.personalColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
  fabIcon: { color: '#0A0A0F', fontSize: 20, fontWeight: '800', marginRight: 6 },
  fabText: { color: '#0A0A0F', fontWeight: '800', fontSize: 14, letterSpacing: 0.3 },

  addModalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  addModalSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 24 },
  addModalLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5, marginBottom: 8 },
  addModalAmountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 16, paddingHorizontal: 20, borderWidth: 1, borderColor: COLORS.glassBorder, marginBottom: 20 },
  addModalCurrency: { fontSize: 24, fontWeight: '800', color: COLORS.primary, marginRight: 4 },
  addModalAmountInput: { flex: 1, fontSize: 28, fontWeight: '800', color: COLORS.text, paddingVertical: 14 },

  categoryScroll: { marginBottom: 16 },
  categoryScrollContent: { gap: 8 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceHigh, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border },
  categoryChipActive: { borderColor: COLORS.personalColor, backgroundColor: `${COLORS.personalColor}15` },
  categoryIcon: { fontSize: 14, marginRight: 6 },
  categoryLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  categoryLabelActive: { color: COLORS.personalColor },

  addModalDescInput: { backgroundColor: COLORS.glass, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.glassBorder, marginBottom: 24 },
  addModalSaveBtn: { borderRadius: 30, overflow: 'hidden', marginBottom: 12 },
  addModalSaveBtnGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 30 },
  addModalSaveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  addModalCancelBtn: { paddingVertical: 12, alignItems: 'center' },
  addModalCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
});
