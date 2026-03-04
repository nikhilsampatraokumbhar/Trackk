import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTracker } from '../store/TrackerContext';
import { TrackerToggle } from '../components/TrackerToggle';
import { TransactionCard } from '../components/TransactionCard';
import { OutlookSetupWizard } from '../components/OutlookSetupWizard';
import { Transaction, RootStackParamList } from '../models/types';
import { subscribeToTransactions } from '../services/FirebaseService';
import { formatCurrency, COLORS } from '../utils/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Outlook connect / connected cards (iOS only) ──────────────────────────────

function OutlookConnectCard() {
  const { trackerState, connectOutlook, disconnectOutlook, isPollingOutlook } = useTracker();
  const connected = !!trackerState.outlookEmail;

  if (connected) {
    return (
      <View style={styles.outlookCard}>
        <View style={styles.outlookCardLeft}>
          <Text style={styles.outlookIcon}>📨</Text>
          <View>
            <Text style={styles.outlookConnectedLabel}>OUTLOOK CONNECTED</Text>
            <Text style={styles.outlookEmail} numberOfLines={1}>
              {trackerState.outlookEmail}
            </Text>
          </View>
        </View>
        <View style={styles.outlookCardRight}>
          {isPollingOutlook && (
            <ActivityIndicator size="small" color={COLORS.reimbursementColor} style={{ marginRight: 10 }} />
          )}
          <TouchableOpacity
            style={styles.outlookDisconnectBtn}
            onPress={disconnectOutlook}
            activeOpacity={0.75}>
            <Text style={styles.outlookDisconnectText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.outlookConnectWrapper}>
      <View style={styles.outlookInfoRow}>
        <Text style={styles.outlookInfoIcon}>💳</Text>
        <Text style={styles.outlookInfoText}>
          We only read your corporate card alert emails — transaction notifications
          like "charged ₹2,400 at IndiGo". Nothing else in your Outlook is ever accessed.
        </Text>
      </View>
      <TouchableOpacity
        style={styles.outlookConnectBtn}
        onPress={connectOutlook}
        activeOpacity={0.8}>
        <Text style={styles.outlookConnectBtnText}>Connect Work Email (Outlook)</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ReimbursementScreen() {
  const navigation = useNavigation<Nav>();
  const { trackerState, toggleReimbursement } = useTracker();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wizardVisible, setWizardVisible] = useState(false);

  useEffect(() => {
    const unsub = subscribeToTransactions('reimbursement', undefined, setTransactions);
    return unsub;
  }, []);

  const handleReimbursementToggle = () => {
    toggleReimbursement();
    // On iOS: show Outlook wizard when turning ON with no work email connected
    if (Platform.OS === 'ios' && !trackerState.reimbursement && !trackerState.outlookEmail) {
      setWizardVisible(true);
    }
  };

  const totalReimbursable = transactions.reduce((sum, t) => sum + t.amount, 0);
  const billsAttached = transactions.filter(t => !!t.billImageUrl).length;

  return (
    <>
      <FlatList
        style={styles.container}
        data={transactions}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            {/* Tracker toggle */}
            <TrackerToggle
              label="Reimbursement Tracking"
              subtitle={
                Platform.OS === 'ios'
                  ? 'Track corp card spends via Outlook alerts'
                  : 'Track expenses to claim back from office'
              }
              isActive={trackerState.reimbursement}
              color={COLORS.reimbursementColor}
              onToggle={handleReimbursementToggle}
            />

            {/* iOS: Outlook connect / connected card */}
            {Platform.OS === 'ios' && trackerState.reimbursement && <OutlookConnectCard />}

            {/* Total reimbursable */}
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total Reimbursable</Text>
              <Text style={styles.totalAmount}>
                {formatCurrency(totalReimbursable)}
              </Text>
              <Text style={styles.totalHint}>
                {transactions.length} expense{transactions.length !== 1 ? 's' : ''} to claim
              </Text>
              {billsAttached > 0 && (
                <View style={styles.billsBadge}>
                  <Text style={styles.billsBadgeText}>
                    📎 {billsAttached} bill{billsAttached !== 1 ? 's' : ''} attached
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.sectionTitle}>Reimbursable Expenses</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('TransactionDetail', {
                transactionId: item.id,
                trackerType: 'reimbursement',
              })
            }
            activeOpacity={0.85}>
            <TransactionCard transaction={item} />
            {/* Bill indicator chip on each row */}
            {item.billImageUrl ? (
              <View style={styles.billChip}>
                <Text style={styles.billChipText}>📎 Bill attached</Text>
              </View>
            ) : (
              <View style={styles.billChipEmpty}>
                <Text style={styles.billChipEmptyText}>+ Add bill</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No reimbursable expenses</Text>
            <Text style={styles.emptySubtitle}>
              {trackerState.reimbursement
                ? 'Transactions will appear here when detected'
                : 'Enable tracking to auto-detect expenses'}
            </Text>
          </View>
        }
      />

      {Platform.OS === 'ios' && (
        <OutlookSetupWizard
          visible={wizardVisible}
          onDismiss={() => setWizardVisible(false)}
        />
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Total card ──
  totalCard: {
    backgroundColor: COLORS.reimbursementColor,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  totalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  totalAmount: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', marginVertical: 4 },
  totalHint: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  billsBadge: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  billsBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },

  // ── Bill chips on each row ──
  billChip: {
    marginHorizontal: 16,
    marginTop: -4,
    marginBottom: 8,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.success + '20',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.success + '40',
  },
  billChipText: { fontSize: 11, fontWeight: '600', color: COLORS.success },
  billChipEmpty: {
    marginHorizontal: 16,
    marginTop: -4,
    marginBottom: 8,
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  billChipEmptyText: { fontSize: 11, fontWeight: '500', color: COLORS.textLight },

  // ── Empty state ──
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 6,
    textAlign: 'center',
  },

  // ── Outlook connect (not yet connected) ──
  outlookConnectWrapper: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  outlookInfoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  outlookInfoIcon: { fontSize: 14, marginRight: 8, marginTop: 1 },
  outlookInfoText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  outlookConnectBtn: {
    backgroundColor: '#0078D4',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  outlookConnectBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },

  // ── Outlook connected card ──
  outlookCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: COLORS.reimbursementColor + '12',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.reimbursementColor + '35',
  },
  outlookCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  outlookIcon: { fontSize: 22, marginRight: 12 },
  outlookConnectedLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.reimbursementColor,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  outlookEmail: { fontSize: 13, fontWeight: '600', color: COLORS.text, maxWidth: 180 },
  outlookCardRight: { flexDirection: 'row', alignItems: 'center' },
  outlookDisconnectBtn: {
    borderWidth: 1,
    borderColor: COLORS.danger + '60',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  outlookDisconnectText: { fontSize: 12, fontWeight: '600', color: COLORS.danger },
});
