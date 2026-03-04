import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Linking,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useGroups } from '../store/GroupContext';
import { formatCurrency, COLORS } from '../utils/helpers';
import { RootStackParamList } from '../models/types';

type RouteProps = RouteProp<RootStackParamList, 'SettleDebt'>;

function buildUpiDeepLink(amount: number, note: string): string {
  const encoded = encodeURIComponent(note);
  return `upi://pay?am=${amount}&cu=INR&tn=${encoded}`;
}

// ── Inline success overlay ────────────────────────────────────────────────────

interface SuccessOverlayProps {
  amount: number;
  toName: string;
  onDone: () => void;
}

function SuccessOverlay({ amount, toName, onDone }: SuccessOverlayProps) {
  // Auto-navigate after 2.5 s; user can also tap "Done" immediately
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View style={overlay.container}>
      {/* Green ring checkmark */}
      <View style={overlay.iconRing}>
        <Text style={overlay.iconText}>✓</Text>
      </View>

      <Text style={overlay.heading}>All Clear!</Text>
      <Text style={overlay.amount}>{formatCurrency(amount)}</Text>
      <Text style={overlay.subtitle}>settled with {toName}</Text>

      <View style={overlay.infoPill}>
        <Text style={overlay.infoText}>Balance updated for everyone in the group</Text>
      </View>

      <TouchableOpacity style={overlay.doneButton} onPress={onDone} activeOpacity={0.8}>
        <Text style={overlay.doneText}>DONE</Text>
      </TouchableOpacity>
    </View>
  );
}

const overlay = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.success + '18',
    borderWidth: 3,
    borderColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconText: {
    fontSize: 40,
    color: COLORS.success,
    fontWeight: '900',
  },
  heading: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  amount: {
    fontSize: 52,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -2,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: 32,
  },
  infoPill: {
    backgroundColor: COLORS.success + '12',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 40,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.success,
    fontWeight: '600',
    textAlign: 'center',
  },
  doneButton: {
    backgroundColor: COLORS.success,
    borderRadius: 4,
    paddingVertical: 14,
    paddingHorizontal: 48,
    // NeoPOP bottom-right shadow
    shadowColor: COLORS.success,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 0,
    elevation: 4,
  },
  doneText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export function SettleDebtScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const { groupId, fromUserId, toUserId, toName, amount } = route.params;

  const { settleDebt } = useGroups();

  const [loading, setLoading] = useState(false);
  const [manualAmount, setManualAmount] = useState(String(amount));
  const [settled, setSettled] = useState<{ amount: number; name: string } | null>(null);

  const markSettled = async (paidAmount: number) => {
    setLoading(true);
    try {
      await settleDebt(groupId, fromUserId, toUserId, paidAmount);
      setSettled({ amount: paidAmount, name: toName });
    } catch {
      Alert.alert('Error', 'Could not record settlement. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePayViaUpi = async () => {
    const upiUrl = buildUpiDeepLink(amount, `Settlement to ${toName}`);
    const canOpen = await Linking.canOpenURL(upiUrl);

    if (canOpen) {
      await Linking.openURL(upiUrl);
      Alert.alert(
        'Did you complete the payment?',
        `Confirm that you paid ${formatCurrency(amount)} to ${toName}`,
        [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Yes, mark as settled', onPress: () => markSettled(amount) },
        ],
      );
    } else {
      Alert.alert(
        'No UPI app found',
        "We couldn't open a UPI payment app. You can manually enter the amount if paid by cash.",
        [{ text: 'OK' }],
      );
    }
  };

  const handleCash = () => {
    const paid = parseFloat(manualAmount);
    if (isNaN(paid) || paid <= 0) {
      Alert.alert('Invalid amount', 'Please enter the amount paid');
      return;
    }
    Alert.alert(
      'Confirm Cash Payment',
      `Mark ${formatCurrency(paid)} paid by cash to ${toName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => markSettled(paid) },
      ],
    );
  };

  // Show the success overlay instead of the form after a successful settle
  if (settled) {
    return (
      <SuccessOverlay
        amount={settled.amount}
        toName={settled.name}
        onDone={() => navigation.goBack()}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Amount header */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>You owe</Text>
        <Text style={styles.headerAmount}>{formatCurrency(amount)}</Text>
        <Text style={styles.headerTo}>to {toName}</Text>
      </View>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {/* Pay via UPI */}
        <TouchableOpacity
          style={styles.upiButton}
          onPress={handlePayViaUpi}
          disabled={loading}
          activeOpacity={0.8}>
          <Text style={styles.upiIcon}>📱</Text>
          <View>
            <Text style={styles.upiTitle}>Pay via UPI App</Text>
            <Text style={styles.upiSubtitle}>
              Opens your payment app (GPay, PhonePe, Paytm…)
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Cash option */}
        <View style={styles.cashSection}>
          <Text style={styles.cashTitle}>Mark as Cash Payment</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>₹</Text>
            <TextInput
              style={styles.amountInput}
              value={manualAmount}
              onChangeText={setManualAmount}
              keyboardType="numeric"
              selectTextOnFocus
            />
          </View>
          <TouchableOpacity
            style={styles.cashButton}
            onPress={handleCash}
            disabled={loading}
            activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.cashButtonText}>Confirm Cash Payment</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.note}>
        Once confirmed, the balance is updated for everyone in the group in real-time.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  headerLabel: {
    fontSize: 14,
    color: '#FFFFFF99',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerAmount: {
    fontSize: 44,
    fontWeight: '900',
    color: '#FFFFFF',
    marginVertical: 4,
  },
  headerTo: {
    fontSize: 16,
    color: '#FFFFFFCC',
    fontWeight: '500',
  },
  optionsContainer: {
    margin: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    elevation: 2,
  },
  upiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '10',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primary + '40',
  },
  upiIcon: { fontSize: 32, marginRight: 14 },
  upiTitle: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  upiSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginHorizontal: 12, fontSize: 13, color: COLORS.textLight },
  cashSection: {},
  cashTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  amountPrefix: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    paddingVertical: 12,
  },
  cashButton: {
    backgroundColor: COLORS.success,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 1,
  },
  cashButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  note: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    marginHorizontal: 24,
    lineHeight: 18,
  },
});
