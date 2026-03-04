import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useTracker } from '../store/TrackerContext';
import { useGroups } from '../store/GroupContext';
import { TrackerToggle } from '../components/TrackerToggle';
import { GmailSetupWizard } from '../components/GmailSetupWizard';
import { COLORS } from '../utils/helpers';

// ── Flow step chip ────────────────────────────────────────────────────────────

function FlowStep({
  icon,
  label,
  highlight,
}: {
  icon: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.flowStep, highlight && styles.flowStepHighlight]}>
      <Text style={styles.flowStepIcon}>{icon}</Text>
      <Text style={[styles.flowStepLabel, highlight && styles.flowStepLabelHighlight]}>
        {label}
      </Text>
    </View>
  );
}

function FlowArrow() {
  return <Text style={styles.flowArrow}>›</Text>;
}

// ── OFF state hero ────────────────────────────────────────────────────────────

function DarkStateHero() {
  const isIos = Platform.OS === 'ios';
  return (
    <View style={styles.heroOff}>
      <View style={styles.heroIconRing}>
        <Text style={styles.heroIconText}>🔒</Text>
      </View>
      <Text style={styles.heroOffTitle}>Completely Dark</Text>
      <Text style={styles.heroOffSubtitle}>
        {isIos
          ? 'No emails are being read.\nZero background activity, zero tracking.'
          : 'Not a single SMS is being read.\nZero background activity, zero tracking.'}
      </Text>
      <View style={styles.flowRow}>
        <FlowStep icon={isIos ? '📧' : '💬'} label={isIos ? 'Bank Email' : 'Bank SMS'} />
        <FlowArrow />
        <View style={styles.blockedChip}>
          <Text style={styles.blockedIcon}>🚫</Text>
          <Text style={styles.blockedLabel}>Blocked</Text>
        </View>
        <FlowArrow />
        <FlowStep icon="📱" label="This app" />
      </View>
      <Text style={styles.heroOffHint}>
        Enable a tracker below to start. You stay in control.
      </Text>
    </View>
  );
}

// ── ON state hero ─────────────────────────────────────────────────────────────

function LiveStateHero({ activeCount }: { activeCount: number }) {
  const isIos = Platform.OS === 'ios';
  return (
    <View style={styles.heroOn}>
      <View style={styles.livePill}>
        <View style={styles.liveDot} />
        <Text style={styles.livePillText}>
          LIVE · {activeCount} tracker{activeCount !== 1 ? 's' : ''} active
        </Text>
      </View>
      <Text style={styles.heroOnTitle}>
        {isIos ? 'Watching your bank emails' : 'Watching for bank SMS'}
      </Text>
      <View style={styles.flowColumn}>
        <View style={styles.flowRow}>
          <FlowStep icon={isIos ? '📧' : '💬'} label={isIos ? 'Bank Email' : 'Bank SMS'} />
          <FlowArrow />
          <FlowStep icon="📲" label="On-device" />
          <FlowArrow />
          <FlowStep icon="🔔" label="Notifies you" highlight />
        </View>
        <View style={styles.approvalRow}>
          <View style={styles.approvalLine} />
          <View style={styles.approvalDecision}>
            <View style={styles.approvalChip}>
              <Text style={styles.approvalChipText}>✅  Add to tracker</Text>
            </View>
            <Text style={styles.approvalOr}>or</Text>
            <View style={[styles.approvalChip, styles.approvalChipIgnore]}>
              <Text style={styles.approvalChipIgnoreText}>❌  Ignore</Text>
            </View>
          </View>
        </View>
      </View>
      <Text style={styles.heroOnNote}>
        {isIos
          ? 'Only bank transaction emails are checked.\nRaw email content never leaves your device.'
          : 'Nothing is saved without your explicit approval.\nRaw SMS never leaves your device.'}
      </Text>
    </View>
  );
}

// ── iOS Gmail connect card ────────────────────────────────────────────────────

function GmailConnectCard() {
  const { trackerState, connectGmail, disconnectGmail, isPollingEmails } = useTracker();
  const connected = !!trackerState.gmailEmail;

  if (connected) {
    return (
      <View style={styles.gmailCard}>
        <View style={styles.gmailCardLeft}>
          <Text style={styles.gmailIcon}>✉️</Text>
          <View>
            <Text style={styles.gmailConnectedLabel}>GMAIL CONNECTED</Text>
            <Text style={styles.gmailEmail} numberOfLines={1}>
              {trackerState.gmailEmail}
            </Text>
          </View>
        </View>
        <View style={styles.gmailCardRight}>
          {isPollingEmails && (
            <ActivityIndicator size="small" color={COLORS.success} style={{ marginRight: 10 }} />
          )}
          <TouchableOpacity
            style={styles.gmailDisconnectBtn}
            onPress={disconnectGmail}
            activeOpacity={0.75}>
            <Text style={styles.gmailDisconnectText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.gmailConnectWrapper}>
      <View style={styles.gmailInfoRow}>
        <Text style={styles.gmailInfoIcon}>ℹ️</Text>
        <Text style={styles.gmailInfoText}>
          We only read your bank alert emails — transaction notifications like "debited ₹500 at Swiggy". Nothing else in your inbox is ever accessed.
        </Text>
      </View>
      <TouchableOpacity
        style={styles.gmailConnectBtn}
        onPress={connectGmail}
        activeOpacity={0.8}>
        <Text style={styles.gmailConnectBtnText}>Connect Gmail Account</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function TrackerSettingsScreen() {
  const { trackerState, isListening, togglePersonal, toggleReimbursement, toggleGroup } =
    useTracker();
  const { groups } = useGroups();
  const [wizardVisible, setWizardVisible] = useState(false);

  const handlePersonalToggle = () => {
    togglePersonal();
    // On iOS: show setup wizard when turning personal ON with no Gmail connected
    if (Platform.OS === 'ios' && !trackerState.personal && !trackerState.gmailEmail) {
      setWizardVisible(true);
    }
  };

  const activeCount =
    (trackerState.personal ? 1 : 0) +
    (trackerState.reimbursement ? 1 : 0) +
    trackerState.activeGroupIds.length;

  // On iOS, "listening" also requires Gmail to be connected
  const isEffectivelyLive =
    Platform.OS === 'ios'
      ? isListening && !!trackerState.gmailEmail
      : isListening;

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>

      {/* Hero */}
      {isEffectivelyLive ? (
        <LiveStateHero activeCount={activeCount} />
      ) : (
        <DarkStateHero />
      )}

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerLabel}>Your Trackers</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Personal */}
      <Text style={styles.sectionTitle}>Personal</Text>
      <TrackerToggle
        label="Personal Expenses"
        subtitle={
          Platform.OS === 'ios'
            ? 'Track day-to-day spending via bank emails'
            : 'Track your personal day-to-day spending'
        }
        isActive={trackerState.personal}
        color={COLORS.personalColor}
        onToggle={handlePersonalToggle}
      />
      {/* On iOS: show Gmail connect card below the personal toggle */}
      {Platform.OS === 'ios' && trackerState.personal && <GmailConnectCard />}

      {/* Reimbursement */}
      <Text style={styles.sectionTitle}>Reimbursement</Text>
      <TrackerToggle
        label="Reimbursement"
        subtitle="Office/business expenses to claim back"
        isActive={trackerState.reimbursement}
        color={COLORS.reimbursementColor}
        onToggle={toggleReimbursement}
      />

      {/* Groups */}
      <Text style={styles.sectionTitle}>
        Groups ({groups.length})
      </Text>
      {groups.length === 0 ? (
        <Text style={styles.noGroupsText}>
          No groups yet. Create one from the Groups tab.
        </Text>
      ) : (
        groups.map(group => (
          <TrackerToggle
            key={group.id}
            label={group.name}
            subtitle={`${group.members.length} members · auto-split`}
            isActive={trackerState.activeGroupIds.includes(group.id)}
            color={COLORS.groupColor}
            onToggle={() => toggleGroup(group.id)}
          />
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>

    {/* iOS Gmail setup wizard — slides up automatically on first enable */}
    {Platform.OS === 'ios' && (
      <GmailSetupWizard
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
  contentContainer: {
    paddingBottom: 20,
  },

  // ── OFF hero ──
  heroOff: {
    margin: 16,
    borderRadius: 20,
    backgroundColor: '#1A1A2E',
    padding: 24,
    alignItems: 'center',
  },
  heroIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF0F',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFFFFF15',
  },
  heroIconText: { fontSize: 32 },
  heroOffTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  heroOffSubtitle: {
    fontSize: 14,
    color: '#FFFFFF80',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  heroOffHint: {
    fontSize: 12,
    color: '#FFFFFF50',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },

  // ── ON hero ──
  heroOn: {
    margin: 16,
    borderRadius: 20,
    backgroundColor: COLORS.success,
    padding: 24,
    alignItems: 'center',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF25',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginRight: 7,
  },
  livePillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroOnTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 18,
  },
  heroOnNote: {
    fontSize: 12,
    color: '#FFFFFFCC',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 12,
  },

  // ── Approval chain ──
  flowColumn: { width: '100%', alignItems: 'center' },
  flowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  flowStep: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF20',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 64,
  },
  flowStepHighlight: { backgroundColor: '#FFFFFF' },
  flowStepIcon: { fontSize: 18, marginBottom: 2 },
  flowStepLabel: { fontSize: 10, fontWeight: '700', color: '#FFFFFFCC', textAlign: 'center' },
  flowStepLabelHighlight: { color: COLORS.success },
  flowArrow: { fontSize: 20, fontWeight: '900', color: '#FFFFFF80', marginHorizontal: 2 },

  blockedChip: {
    alignItems: 'center',
    backgroundColor: '#FF000025',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#FF000040',
    minWidth: 64,
  },
  blockedIcon: { fontSize: 18, marginBottom: 2 },
  blockedLabel: { fontSize: 10, fontWeight: '700', color: '#FF6B6B' },

  approvalRow: { marginTop: 8, alignItems: 'center', width: '100%' },
  approvalLine: { width: 1, height: 10, backgroundColor: '#FFFFFF40', marginBottom: 6 },
  approvalDecision: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  approvalChip: {
    backgroundColor: '#FFFFFF25',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  approvalChipText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  approvalOr: { fontSize: 11, color: '#FFFFFF70', fontStyle: 'italic' },
  approvalChipIgnore: { backgroundColor: '#00000020' },
  approvalChipIgnoreText: { fontSize: 11, fontWeight: '700', color: '#FFFFFFAA' },

  // ── Divider ──
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textLight,
    marginHorizontal: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Toggles ──
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noGroupsText: { fontSize: 13, color: COLORS.textLight, marginHorizontal: 16, marginTop: 8 },

  // ── Gmail connect (iOS) ──
  gmailConnectWrapper: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  gmailInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  gmailInfoIcon: { fontSize: 14, marginRight: 8, marginTop: 1 },
  gmailInfoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  gmailConnectBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  gmailConnectBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  gmailCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: COLORS.success + '12',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.success + '35',
  },
  gmailCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  gmailIcon: { fontSize: 22, marginRight: 12 },
  gmailConnectedLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.success,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  gmailEmail: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    maxWidth: 180,
  },
  gmailCardRight: { flexDirection: 'row', alignItems: 'center' },
  gmailDisconnectBtn: {
    borderWidth: 1,
    borderColor: COLORS.danger + '60',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  gmailDisconnectText: { fontSize: 12, fontWeight: '600', color: COLORS.danger },
});
