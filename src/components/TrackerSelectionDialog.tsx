import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { ActiveTracker, ParsedTransaction, TrackerType } from '../models/types';
import { formatCurrency, COLORS } from '../utils/helpers';

interface TrackerSelectionDialogProps {
  visible: boolean;
  transaction: ParsedTransaction | null;
  activeTrackers: ActiveTracker[];
  onSelect: (trackerType: TrackerType, trackerId: string) => Promise<void>;
  onDismiss: () => void;
}

type Phase = 'idle' | 'saving' | 'saved';

/**
 * Dialog that appears when multiple trackers are active and a transaction
 * is detected. User selects which tracker(s) to add the transaction to.
 *
 * Flow: idle → (tap) → saving (spinner) → saved (green checkmark, 1.5 s) → dismiss
 */
export function TrackerSelectionDialog({
  visible,
  transaction,
  activeTrackers,
  onSelect,
  onDismiss,
}: TrackerSelectionDialogProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [savedLabel, setSavedLabel] = useState('');

  // Reset phase when the dialog becomes visible again
  useEffect(() => {
    if (visible) setPhase('idle');
  }, [visible]);

  // Auto-dismiss after showing the success confirmation
  useEffect(() => {
    if (phase !== 'saved') return;
    const t = setTimeout(onDismiss, 1500);
    return () => clearTimeout(t);
  }, [phase, onDismiss]);

  if (!transaction) return null;

  const colorMap: Record<TrackerType, string> = {
    personal: COLORS.personalColor,
    group: COLORS.groupColor,
    reimbursement: COLORS.reimbursementColor,
  };

  const handleSelect = async (type: TrackerType, id: string, label: string) => {
    setPhase('saving');
    try {
      await onSelect(type, id);
      setSavedLabel(label);
      setPhase('saved');
    } catch {
      setPhase('idle');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>

          {/* ── Success confirmation phase ─────────────────────────────── */}
          {phase === 'saved' && (
            <View style={styles.successContainer}>
              <View style={styles.successIconWrap}>
                <Text style={styles.successIcon}>✓</Text>
              </View>
              <Text style={styles.successTitle}>Transaction Tracked</Text>
              <Text style={styles.successAmount}>{formatCurrency(transaction.amount)}</Text>
              <Text style={styles.successSub}>Added to {savedLabel}</Text>
            </View>
          )}

          {/* ── Idle / saving phase ────────────────────────────────────── */}
          {phase !== 'saved' && (
            <>
              {/* Header */}
              <Text style={styles.title}>New Transaction Detected</Text>
              <Text style={styles.amount}>{formatCurrency(transaction.amount)}</Text>
              {transaction.merchant && (
                <Text style={styles.merchant}>{transaction.merchant}</Text>
              )}

              {/* Info banner */}
              <View style={styles.infoBanner}>
                <Text style={styles.infoText}>
                  {activeTrackers.length === 1
                    ? 'Tap below to record this transaction'
                    : `You have ${activeTrackers.length} active trackers. Choose where to record:`}
                </Text>
              </View>

              {/* Tracker options (disabled while saving) */}
              <FlatList
                data={activeTrackers}
                keyExtractor={item => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.trackerOption,
                      { borderLeftColor: colorMap[item.type] },
                      phase === 'saving' && styles.trackerOptionDisabled,
                    ]}
                    onPress={() => handleSelect(item.type, item.id, item.label)}
                    activeOpacity={0.7}
                    disabled={phase === 'saving'}>
                    <View style={[styles.trackerDot, { backgroundColor: colorMap[item.type] }]} />
                    <View style={styles.trackerInfo}>
                      <Text style={styles.trackerLabel}>{item.label}</Text>
                      <Text style={styles.trackerType}>
                        {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                      </Text>
                    </View>
                    {phase === 'saving' ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <Text style={styles.addText}>ADD</Text>
                    )}
                  </TouchableOpacity>
                )}
              />

              {/* Dismiss */}
              <TouchableOpacity
                style={styles.ignoreButton}
                onPress={onDismiss}
                disabled={phase === 'saving'}>
                <Text style={[styles.ignoreText, phase === 'saving' && { opacity: 0.4 }]}>
                  Ignore this transaction
                </Text>
              </TouchableOpacity>
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  dialog: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 34,
    maxHeight: '70%',
  },

  // ── Success ──
  successContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.success + '20',
    borderWidth: 2,
    borderColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIcon: {
    fontSize: 28,
    color: COLORS.success,
    fontWeight: '900',
  },
  successTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  successAmount: {
    fontSize: 38,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -1,
    marginBottom: 6,
  },
  successSub: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // ── Idle / saving ──
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  amount: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.danger,
    textAlign: 'center',
    marginTop: 8,
  },
  merchant: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  infoBanner: {
    backgroundColor: COLORS.primary + '10',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.primary,
    textAlign: 'center',
  },
  trackerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    marginVertical: 4,
    borderLeftWidth: 4,
  },
  trackerOptionDisabled: {
    opacity: 0.5,
  },
  trackerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  trackerInfo: {
    flex: 1,
  },
  trackerLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  trackerType: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  addText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  ignoreButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  ignoreText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
