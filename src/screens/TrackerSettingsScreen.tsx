import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import TrackerToggle from '../components/TrackerToggle';
import { useTheme } from '../store/ThemeContext';
import { COLORS } from '../utils/helpers';

export default function TrackerSettingsScreen() {
  const { groups } = useGroups();
  const { trackerState, isListening, togglePersonal, toggleReimbursement, toggleGroup } = useTracker();
  const { colors } = useTheme();

  const activeCount =
    (trackerState.personal ? 1 : 0) +
    (trackerState.reimbursement ? 1 : 0) +
    trackerState.activeGroupIds.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Status card */}
      <View style={[
        styles.statusCard,
        isListening ? styles.statusActive : styles.statusInactive,
      ]}>
        <View style={styles.statusLeft}>
          <View style={[
            styles.statusDot,
            { backgroundColor: isListening ? COLORS.success : COLORS.textLight },
          ]} />
          <View>
            <Text style={[
              styles.statusTitle,
              { color: isListening ? COLORS.success : COLORS.textSecondary },
            ]}>
              {isListening ? 'Expense Tracking Active' : 'Expense Tracking Inactive'}
            </Text>
            <Text style={styles.statusSub}>
              {isListening
                ? `${activeCount} tracker${activeCount !== 1 ? 's' : ''} running`
                : 'Enable a tracker below to start'}
            </Text>
          </View>
        </View>
        {isListening && (
          <View style={styles.activeCount}>
            <Text style={styles.activeCountText}>{activeCount}</Text>
          </View>
        )}
      </View>

      {/* How it works */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>HOW IT WORKS</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>📱</Text>
          <Text style={styles.infoText}>Detects expenses automatically when trackers are on</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>🔔</Text>
          <Text style={styles.infoText}>1 tracker → "Add" button in notification</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>📋</Text>
          <Text style={styles.infoText}>2+ trackers → adds to default, tap to change</Text>
        </View>
        <View style={[styles.infoRow, styles.infoWarning]}>
          <Text style={styles.infoIcon}>⚠️</Text>
          <Text style={[styles.infoText, { color: COLORS.warning }]}>
            Reimbursement + Group trackers cannot be active together
          </Text>
        </View>
      </View>

      {/* Personal trackers */}
      <Text style={styles.sectionTitle}>PERSONAL TRACKERS</Text>
      <TrackerToggle
        label="Personal Expenses"
        subtitle="Daily spending"
        isActive={trackerState.personal}
        onToggle={togglePersonal}
        color={COLORS.personalColor}
      />
      <TrackerToggle
        label="Reimbursement"
        subtitle="Office / business expenses"
        isActive={trackerState.reimbursement}
        onToggle={toggleReimbursement}
        color={COLORS.reimbursementColor}
      />

      {/* Group trackers */}
      {groups.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>GROUP TRACKERS</Text>
          {groups.map(group => (
            <TrackerToggle
              key={group.id}
              label={group.name}
              subtitle={`${group.members.length} members · auto-split`}
              isActive={trackerState.activeGroupIds.includes(group.id)}
              onToggle={() => toggleGroup(group.id)}
              color={COLORS.groupColor}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },

  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  statusActive: {
    backgroundColor: `${COLORS.success}12`,
    borderColor: `${COLORS.success}30`,
  },
  statusInactive: {
    backgroundColor: COLORS.surfaceHigh,
    borderColor: COLORS.border,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  activeCount: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: `${COLORS.success}25`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCountText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.success,
  },

  infoCard: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  infoTitle: {
    fontSize: 10,
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoWarning: {
    backgroundColor: `${COLORS.warning}10`,
    padding: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  infoIcon: { fontSize: 14, width: 20 },
  infoText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 18,
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
    marginTop: 4,
  },
});
