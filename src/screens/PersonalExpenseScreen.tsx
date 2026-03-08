import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  TouchableOpacity, Alert, NativeModules, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTracker } from '../store/TrackerContext';
import { getTransactions } from '../services/StorageService';
import { Transaction } from '../models/types';
import TrackerToggle from '../components/TrackerToggle';
import TransactionCard from '../components/TransactionCard';
import { COLORS, formatCurrency } from '../utils/helpers';
import { checkSmsPermission } from '../services/SmsService';
import { showTransactionNotification, requestNotificationPermission } from '../services/NotificationService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function PersonalExpenseScreen() {
  const nav = useNavigation<Nav>();
  const { trackerState, togglePersonal, isListening } = useTracker();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const txns = await getTransactions('personal');
    setTransactions(txns.sort((a, b) => b.timestamp - a.timestamp));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const now = new Date();
  const thisMonth = transactions.filter(t => {
    const d = new Date(t.timestamp);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalMonthly = thisMonth.reduce((s, t) => s + t.amount, 0);
  const totalAll = transactions.reduce((s, t) => s + t.amount, 0);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
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
          {/* Toggle */}
          <TrackerToggle
            label="Personal Expenses"
            subtitle="Track daily spending from SMS"
            isActive={trackerState.personal}
            onToggle={togglePersonal}
            color={COLORS.personalColor}
          />

          {/* iOS Setup Banner */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={styles.iosSetupBanner}
              onPress={() => nav.navigate('IOSSetup' as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.iosSetupEmoji}>📱</Text>
              <View style={styles.iosSetupContent}>
                <Text style={styles.iosSetupTitle}>Set up iPhone automation</Text>
                <Text style={styles.iosSetupSub}>Use iOS Shortcuts for automatic tracking</Text>
              </View>
              <Text style={styles.iosSetupArrow}>{'>'}</Text>
            </TouchableOpacity>
          )}

          {/* Debug diagnostics */}
          {trackerState.personal && Platform.OS === 'android' && (
            <View style={styles.debugBox}>
              <Text style={styles.debugTitle}>DIAGNOSTICS</Text>
              <Text style={styles.debugText}>
                Listener active: {isListening ? 'YES' : 'NO'}
              </Text>
              <Text style={styles.debugText}>
                SmsListenerModule: {NativeModules.SmsListenerModule ? 'LOADED' : 'MISSING'}
              </Text>
              <Text style={styles.debugText}>
                SmsAndroid (polling): {NativeModules.SmsAndroid ? 'LOADED' : 'MISSING'}
              </Text>
              <TouchableOpacity
                style={styles.debugBtn}
                onPress={async () => {
                  const sms = await checkSmsPermission();
                  const notif = await requestNotificationPermission();
                  Alert.alert('Permissions', `SMS: ${sms ? 'GRANTED' : 'DENIED'}\nNotifications: ${notif ? 'GRANTED' : 'DENIED'}`);
                }}
              >
                <Text style={styles.debugBtnText}>Check Permissions</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.debugBtn, { marginTop: 8 }]}
                onPress={async () => {
                  try {
                    await showTransactionNotification(
                      {
                        amount: 1,
                        type: 'debit',
                        merchant: 'Test Merchant',
                        bank: 'HDFC Bank',
                        rawMessage: 'Test SMS message',
                        timestamp: Date.now(),
                      },
                      [{ type: 'personal', id: 'personal', label: 'Personal' }],
                    );
                    Alert.alert('Success', 'Test notification sent! Check your notification bar.');
                  } catch (e: any) {
                    Alert.alert('Error', `Notification failed: ${e.message}`);
                  }
                }}
              >
                <Text style={styles.debugBtnText}>Send Test Notification</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Stats hero */}
          <LinearGradient
            colors={['#140E20', '#0A0A0F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={[styles.heroAccent, { backgroundColor: COLORS.personalColor }]} />
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>THIS MONTH</Text>
                <Text style={[styles.statValue, { color: COLORS.personalColor }]}>
                  {formatCurrency(totalMonthly)}
                </Text>
                <Text style={styles.statCount}>{thisMonth.length} transactions</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statLabel}>ALL TIME</Text>
                <Text style={[styles.statValue, { color: COLORS.text }]}>
                  {formatCurrency(totalAll)}
                </Text>
                <Text style={styles.statCount}>{transactions.length} total</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Section heading */}
          <Text style={styles.sectionTitle}>ALL TRANSACTIONS</Text>

          {transactions.length === 0 && (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyEmoji}>💳</Text>
              </View>
              <Text style={styles.emptyText}>
                {trackerState.personal
                  ? 'No personal expenses yet'
                  : 'Enable the tracker above to start'}
              </Text>
            </View>
          )}
        </>
      )}
      data={transactions}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <TransactionCard
          transaction={item}
          onPress={() => nav.navigate('TransactionDetail', { transactionId: item.id })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  heroCard: {
    borderRadius: 18,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  heroAccent: {
    height: 2,
  },
  statsRow: {
    flexDirection: 'row',
    padding: 20,
  },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
  },
  statLabel: {
    fontSize: 9,
    color: COLORS.textSecondary,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statCount: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
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
  debugBox: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 12,
    padding: 14,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  debugTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.warning || '#FFA500',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    color: COLORS.text,
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  debugBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center' as const,
    marginTop: 10,
  },
  debugBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyEmoji: { fontSize: 26 },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  iosSetupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.primary}12`,
    borderRadius: 14,
    padding: 14,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    gap: 12,
  },
  iosSetupEmoji: {
    fontSize: 24,
  },
  iosSetupContent: {
    flex: 1,
  },
  iosSetupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  iosSetupSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  iosSetupArrow: {
    fontSize: 18,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
