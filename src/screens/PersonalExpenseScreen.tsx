import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, SectionList, RefreshControl,
  TouchableOpacity, Alert, NativeModules, Platform, AppState,
  TextInput, ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticLight, hapticMedium, hapticSuccess } from '../utils/haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { useTracker } from '../store/TrackerContext';
import { useTheme } from '../store/ThemeContext';
import EmptyState from '../components/EmptyState';
import PressableScale from '../components/PressableScale';
import { getTransactions, saveTransaction, deleteTransaction } from '../services/StorageService';
import { Transaction, ParsedTransaction } from '../models/types';
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
  const { trackerState, isListening, transactionVersion } = useTracker();
  const { colors, isDark } = useTheme();
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

  // Search, filter, sort
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [showFilters, setShowFilters] = useState(false);

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

  // Filtered + sorted transactions
  const filteredTransactions = useMemo(() => {
    let result = transactions;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(t =>
        (t.description || '').toLowerCase().includes(q) ||
        (t.merchant || '').toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    }

    // Category filter
    if (selectedCategory) {
      result = result.filter(t => (t.category || 'Other') === selectedCategory);
    }

    // Sort
    if (sortBy === 'amount') {
      result = [...result].sort((a, b) => b.amount - a.amount);
    }
    // date sort is default (already sorted by timestamp desc)

    return result;
  }, [transactions, searchQuery, selectedCategory, sortBy]);

  const sections = useMemo(() => groupByDate(filteredTransactions), [filteredTransactions]);

  // Get unique categories from transactions
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const t of transactions) {
      cats.add(t.category || 'Other');
    }
    return Array.from(cats).sort();
  }, [transactions]);

  // Dynamic styles
  const dynamicStyles = useMemo(() => ({
    container: { flex: 1, backgroundColor: colors.background } as const,
    dateHeaderLine: { flex: 1, height: 1, backgroundColor: colors.border } as const,
    dateHeaderText: { fontSize: 10, fontWeight: '600' as const, color: colors.textSecondary, letterSpacing: 1.5, textTransform: 'uppercase' as const, paddingHorizontal: 12 },
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginVertical: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden' as const,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    heroAccent: { height: 2, backgroundColor: colors.personalColor },
    statDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: 16 },
    statLabel: { fontSize: 10, color: colors.textSecondary, letterSpacing: 2, fontWeight: '600' as const, marginBottom: 8 },
    statValue: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.5 },
    statCount: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
    quickAccessCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center' as const,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    quickAccessIconWrap: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 10 },
    quickAccessTitle: { fontSize: 13, fontWeight: '600' as const, color: colors.text, marginBottom: 2 },
    quickAccessSub: { fontSize: 10, color: colors.textSecondary, textAlign: 'center' as const, lineHeight: 14 },
    debugBox: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginVertical: 10,
      borderWidth: 1,
      borderColor: `${colors.warning}30`,
    },
    debugTitle: { fontSize: 10, fontWeight: '600' as const, color: colors.warning, letterSpacing: 1.5, marginBottom: 8 },
    debugText: { fontSize: 12, color: colors.text, marginBottom: 4, fontFamily: 'monospace' as const },
    debugBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' as const, marginTop: 10 },
    debugBtnText: { color: '#FFFFFF', fontWeight: '600' as const, fontSize: 13 },
    iosSetupBanner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    iosSetupTitle: { fontSize: 14, fontWeight: '600' as const, color: colors.primary },
    iosSetupSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    iosSetupArrow: { fontSize: 18, color: colors.textSecondary, fontWeight: '600' as const },
    fab: {
      position: 'absolute' as const,
      right: 20,
      bottom: 20,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderRadius: 30,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
    },
    fabIcon: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' as const, marginRight: 6 },
    fabText: { color: '#FFFFFF', fontWeight: '700' as const, fontSize: 14, letterSpacing: 0.3 },
    addModalTitle: { fontSize: 20, fontWeight: '700' as const, color: colors.text, textAlign: 'center' as const, marginBottom: 4 },
    addModalSub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' as const, marginBottom: 24 },
    addModalLabel: { fontSize: 10, fontWeight: '600' as const, color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 8 },
    addModalAmountRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 20,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 20,
    },
    addModalCurrency: { fontSize: 24, fontWeight: '700' as const, color: colors.primary, marginRight: 4 },
    addModalAmountInput: { flex: 1, fontSize: 28, fontWeight: '700' as const, color: colors.text, paddingVertical: 14 },
    categoryChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.surfaceHigh,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryChipActive: { borderColor: colors.personalColor, backgroundColor: `${colors.personalColor}15` },
    categoryLabel: { fontSize: 12, fontWeight: '600' as const, color: colors.textSecondary },
    categoryLabelActive: { color: colors.personalColor },
    addModalDescInput: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 14,
      fontSize: 14,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 24,
    },
    addModalSaveBtn: { borderRadius: 30, overflow: 'hidden' as const, marginBottom: 12, backgroundColor: colors.primary, paddingVertical: 16, alignItems: 'center' as const },
    addModalSaveBtnText: { fontSize: 15, fontWeight: '600' as const, color: '#FFFFFF' },
    addModalCancelText: { fontSize: 14, fontWeight: '600' as const, color: colors.textSecondary },
    searchInputWrap: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 12 },
    searchClear: { fontSize: 14, color: colors.textSecondary, padding: 4 },
    filterToggleBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    filterToggleBtnActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}10` },
    filterToggleText: { fontSize: 12, color: colors.textSecondary },
    filterSection: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterLabel: { fontSize: 10, fontWeight: '600' as const, color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
    sortBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.surfaceHigh,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sortBtnActive: { borderColor: colors.personalColor, backgroundColor: `${colors.personalColor}12` },
    sortBtnText: { fontSize: 12, fontWeight: '600' as const, color: colors.textSecondary },
    sortBtnTextActive: { color: colors.personalColor },
    filterCatChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.surfaceHigh,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 8,
    },
    filterCatChipActive: { borderColor: colors.personalColor, backgroundColor: `${colors.personalColor}12` },
    filterCatText: { fontSize: 12, fontWeight: '600' as const, color: colors.textSecondary },
    filterCatTextActive: { color: colors.personalColor },
    clearFiltersText: { fontSize: 12, fontWeight: '600' as const, color: colors.primary },
  }), [colors]);

  if (loading) {
    return (
      <View style={dynamicStyles.container}>
        <View style={styles.content}>
          <HeroCardSkeleton />
          <TransactionListSkeleton count={4} />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <SectionList
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        sections={sections}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.dateHeader}>
            <View style={dynamicStyles.dateHeaderLine} />
            <Text style={dynamicStyles.dateHeaderText}>{title}</Text>
            <View style={dynamicStyles.dateHeaderLine} />
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
            {Platform.OS === 'ios' && (
              <TouchableOpacity style={dynamicStyles.iosSetupBanner} onPress={() => nav.navigate('IOSSetup' as any)} activeOpacity={0.7}>
                <Text style={styles.iosSetupEmoji}>📱</Text>
                <View style={styles.iosSetupContent}>
                  <Text style={dynamicStyles.iosSetupTitle}>Set up iPhone automation</Text>
                  <Text style={dynamicStyles.iosSetupSub}>Use iOS Shortcuts for automatic tracking</Text>
                </View>
                <Text style={dynamicStyles.iosSetupArrow}>{'>'}</Text>
              </TouchableOpacity>
            )}

            {isDevMode() && trackerState.personal && Platform.OS === 'android' && (
              <View style={dynamicStyles.debugBox}>
                <Text style={dynamicStyles.debugTitle}>DIAGNOSTICS (DEV)</Text>
                <Text style={dynamicStyles.debugText}>Listener: {isListening ? 'YES' : 'NO'}</Text>
                <Text style={dynamicStyles.debugText}>SmsListenerModule: {NativeModules.SmsListenerModule ? 'OK' : 'MISSING'}</Text>
                <Text style={dynamicStyles.debugText}>SmsAndroid: {NativeModules.SmsAndroid ? 'OK' : 'MISSING'}</Text>
                <TouchableOpacity style={dynamicStyles.debugBtn} onPress={async () => {
                  const sms = await checkSmsPermission();
                  const notif = await requestNotificationPermission();
                  Alert.alert('Permissions', `SMS: ${sms ? 'GRANTED' : 'DENIED'}\nNotifications: ${notif ? 'GRANTED' : 'DENIED'}`);
                }}>
                  <Text style={dynamicStyles.debugBtnText}>Check Permissions</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[dynamicStyles.debugBtn, { marginTop: 8 }]} onPress={async () => {
                  try {
                    await showTransactionNotification(
                      { amount: 1, type: 'debit', merchant: 'Test Merchant', bank: 'HDFC Bank', rawMessage: 'Test SMS message', timestamp: Date.now() },
                      [{ type: 'personal', id: 'personal', label: 'Personal' }],
                    );
                    Alert.alert('Success', 'Test notification sent!');
                  } catch (e: any) { Alert.alert('Error', e.message); }
                }}>
                  <Text style={dynamicStyles.debugBtnText}>Send Test Notification</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Search + Filter Bar */}
            <View style={styles.searchRow}>
              <View style={dynamicStyles.searchInputWrap}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={dynamicStyles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search expenses..."
                  placeholderTextColor={colors.textLight}
                  returnKeyType="search"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={dynamicStyles.searchClear}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={[dynamicStyles.filterToggleBtn, showFilters && dynamicStyles.filterToggleBtnActive]}
                onPress={() => { hapticLight(); setShowFilters(!showFilters); }}
                activeOpacity={0.7}
              >
                <Text style={dynamicStyles.filterToggleText}>{showFilters ? '▲' : '▼'}</Text>
              </TouchableOpacity>
            </View>

            {showFilters && (
              <View style={dynamicStyles.filterSection}>
                {/* Sort toggle */}
                <View style={styles.sortRow}>
                  <Text style={dynamicStyles.filterLabel}>SORT BY</Text>
                  <View style={styles.sortBtns}>
                    <TouchableOpacity
                      style={[dynamicStyles.sortBtn, sortBy === 'date' && dynamicStyles.sortBtnActive]}
                      onPress={() => setSortBy('date')}
                    >
                      <Text style={[dynamicStyles.sortBtnText, sortBy === 'date' && dynamicStyles.sortBtnTextActive]}>Date</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[dynamicStyles.sortBtn, sortBy === 'amount' && dynamicStyles.sortBtnActive]}
                      onPress={() => setSortBy('amount')}
                    >
                      <Text style={[dynamicStyles.sortBtnText, sortBy === 'amount' && dynamicStyles.sortBtnTextActive]}>Amount</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Category filter chips */}
                {availableCategories.length > 0 && (
                  <>
                    <Text style={dynamicStyles.filterLabel}>CATEGORY</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterCatScroll}>
                      <TouchableOpacity
                        style={[dynamicStyles.filterCatChip, !selectedCategory && dynamicStyles.filterCatChipActive]}
                        onPress={() => setSelectedCategory(null)}
                      >
                        <Text style={[dynamicStyles.filterCatText, !selectedCategory && dynamicStyles.filterCatTextActive]}>All</Text>
                      </TouchableOpacity>
                      {availableCategories.map(cat => (
                        <TouchableOpacity
                          key={cat}
                          style={[dynamicStyles.filterCatChip, selectedCategory === cat && dynamicStyles.filterCatChipActive]}
                          onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                        >
                          <Text style={[dynamicStyles.filterCatText, selectedCategory === cat && dynamicStyles.filterCatTextActive]}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                {(searchQuery || selectedCategory || sortBy !== 'date') && (
                  <TouchableOpacity
                    style={styles.clearFiltersBtn}
                    onPress={() => { setSearchQuery(''); setSelectedCategory(null); setSortBy('date'); }}
                  >
                    <Text style={dynamicStyles.clearFiltersText}>Clear all filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={dynamicStyles.heroCard}>
              <View style={dynamicStyles.heroAccent} />
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={dynamicStyles.statLabel}>THIS MONTH</Text>
                  <AnimatedAmount value={totalMonthly} style={[dynamicStyles.statValue, { color: colors.personalColor }]} />
                  <Text style={dynamicStyles.statCount}>{thisMonth.length} transactions</Text>
                </View>
                <View style={dynamicStyles.statDivider} />
                <View style={styles.stat}>
                  <Text style={dynamicStyles.statLabel}>ALL TIME</Text>
                  <AnimatedAmount value={totalAll} style={[dynamicStyles.statValue, { color: colors.text }]} />
                  <Text style={dynamicStyles.statCount}>{transactions.length} total</Text>
                </View>
              </View>
            </View>

            <View style={styles.quickAccessRow}>
              <PressableScale style={dynamicStyles.quickAccessCard} onPress={() => nav.navigate('Goals')}>
                <View style={[dynamicStyles.quickAccessIconWrap, { backgroundColor: `${colors.success}18`, borderColor: `${colors.success}30` }]}>
                  <Text style={styles.quickAccessIcon}>🎯</Text>
                </View>
                <Text style={dynamicStyles.quickAccessTitle}>Savings Goals</Text>
                <Text style={dynamicStyles.quickAccessSub}>Set targets & daily budgets</Text>
              </PressableScale>
              <PressableScale style={dynamicStyles.quickAccessCard} onPress={() => nav.navigate('Reimbursement')}>
                <View style={[dynamicStyles.quickAccessIconWrap, { backgroundColor: `${colors.reimbursementColor}18`, borderColor: `${colors.reimbursementColor}30` }]}>
                  <Text style={styles.quickAccessIcon}>🧾</Text>
                </View>
                <Text style={dynamicStyles.quickAccessTitle}>Reimbursement</Text>
                <Text style={dynamicStyles.quickAccessSub}>Track office expenses</Text>
              </PressableScale>
            </View>

            {transactions.length === 0 && (
              <EmptyState
                icon="💳"
                title="No expenses yet"
                subtitle="Your expenses will show up here automatically"
                accent={colors.personalColor}
              />
            )}
          </>
        }
        ListEmptyComponent={transactions.length > 0 ? null : undefined}
      />

      {/* Add Expense FAB */}
      <TouchableOpacity style={dynamicStyles.fab} onPress={() => { hapticMedium(); setShowAddModal(true); }} activeOpacity={0.8}>
        <Text style={dynamicStyles.fabIcon}>+</Text>
        <Text style={dynamicStyles.fabText}>Add Expense</Text>
      </TouchableOpacity>

      {/* Add Expense Bottom Sheet */}
      <BottomSheet visible={showAddModal} onClose={() => { setShowAddModal(false); setAddAmount(''); setAddDescription(''); }}>
        <Text style={dynamicStyles.addModalTitle}>Add Expense</Text>
        <Text style={dynamicStyles.addModalSub}>Log a cash or missed expense</Text>

        <Text style={dynamicStyles.addModalLabel}>AMOUNT</Text>
        <View style={dynamicStyles.addModalAmountRow}>
          <Text style={dynamicStyles.addModalCurrency}>₹</Text>
          <TextInput
            style={dynamicStyles.addModalAmountInput}
            value={addAmount}
            onChangeText={setAddAmount}
            placeholder="0"
            placeholderTextColor={colors.textLight}
            keyboardType="decimal-pad"
            autoFocus
          />
        </View>

        <Text style={dynamicStyles.addModalLabel}>QUICK PICK</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryScrollContent}>
          {PERSONAL_CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.label}
              style={[dynamicStyles.categoryChip, addDescription === cat.label && dynamicStyles.categoryChipActive]}
              onPress={() => { hapticLight(); selectCategory(cat.label); }}
              activeOpacity={0.7}
            >
              <Text style={styles.categoryIcon}>{cat.icon}</Text>
              <Text style={[dynamicStyles.categoryLabel, addDescription === cat.label && dynamicStyles.categoryLabelActive]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={dynamicStyles.addModalLabel}>OR DESCRIBE</Text>
        <TextInput
          style={dynamicStyles.addModalDescInput}
          value={addDescription}
          onChangeText={setAddDescription}
          placeholder="e.g. Parking, Snacks, Subscription..."
          placeholderTextColor={colors.textLight}
          maxLength={200}
        />

        <TouchableOpacity style={[dynamicStyles.addModalSaveBtn, saving && { opacity: 0.5 }]} onPress={handleAddExpense} disabled={saving} activeOpacity={0.8}>
          <Text style={dynamicStyles.addModalSaveBtnText}>{saving ? 'Saving...' : 'Save Expense'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.addModalCancelBtn} onPress={() => { setShowAddModal(false); setAddAmount(''); setAddDescription(''); }}>
          <Text style={dynamicStyles.addModalCancelText}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* Success overlay */}
      <SuccessOverlay visible={showSuccess} message="Expense saved" subMessage={successAmount} onDone={() => setShowSuccess(false)} color={colors.personalColor} />

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
  content: { padding: 16, paddingBottom: 80 },

  dateHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 10 },

  statsRow: { flexDirection: 'row', padding: 22 },
  stat: { flex: 1, alignItems: 'center' },

  quickAccessRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickAccessIcon: { fontSize: 18 },

  iosSetupEmoji: { fontSize: 24 },
  iosSetupContent: { flex: 1 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  searchIcon: { fontSize: 14, marginRight: 8 },

  sortRow: { marginBottom: 12 },
  sortBtns: { flexDirection: 'row', gap: 8 },

  filterCatScroll: { marginBottom: 8 },
  clearFiltersBtn: { alignItems: 'center', paddingVertical: 8, marginTop: 4 },

  categoryScroll: { marginBottom: 16 },
  categoryScrollContent: { gap: 8 },
  categoryIcon: { fontSize: 14, marginRight: 6 },

  addModalCancelBtn: { paddingVertical: 12, alignItems: 'center' },
});
