import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import TrackerToggle from '../components/TrackerToggle';
import { useTheme } from '../store/ThemeContext';

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
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Status card */}
      <View style={[
        styles.statusCard,
        isListening
          ? { backgroundColor: `${colors.success}12`, borderColor: `${colors.success}30` }
          : { backgroundColor: colors.surfaceHigh, borderColor: colors.border },
      ]}>
        <View style={styles.statusLeft}>
          <View style={[
            styles.statusDot,
            { backgroundColor: isListening ? colors.success : colors.textLight },
          ]} />
          <View>
            <Text style={[
              styles.statusTitle,
              { color: isListening ? colors.success : colors.textSecondary },
            ]}>
              {isListening ? 'Expense Tracking Active' : 'Expense Tracking Inactive'}
            </Text>
            <Text style={[styles.statusSub, { color: colors.textSecondary }]}>
              {isListening
                ? `${activeCount} tracker${activeCount !== 1 ? 's' : ''} running`
                : 'Enable a tracker below to start'}
            </Text>
          </View>
        </View>
        {isListening && (
          <View style={[styles.activeCount, { backgroundColor: `${colors.success}25` }]}>
            <Text style={[styles.activeCountText, { color: colors.success }]}>{activeCount}</Text>
          </View>
        )}
      </View>

      {/* How it works */}
      <View style={[styles.infoCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
        <Text style={[styles.infoTitle, { color: colors.textSecondary }]}>HOW IT WORKS</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>📱</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>Detects expenses automatically when trackers are on</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>🔔</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>1 tracker → "Add" button in notification</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>📋</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>2+ trackers → adds to default, tap to change</Text>
        </View>
        <View style={[styles.infoWarning, { backgroundColor: `${colors.warning}10` }]}>
          <Text style={styles.infoIcon}>⚠️</Text>
          <Text style={[styles.infoText, { color: colors.warning }]}>
            Reimbursement + Group trackers cannot be active together
          </Text>
        </View>
      </View>

      {/* Personal trackers */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PERSONAL TRACKERS</Text>
      <TrackerToggle
        label="Personal Expenses"
        subtitle="Daily spending"
        isActive={trackerState.personal}
        onToggle={togglePersonal}
        color={colors.personalColor}
      />
      <TrackerToggle
        label="Reimbursement"
        subtitle="Office / business expenses"
        isActive={trackerState.reimbursement}
        onToggle={toggleReimbursement}
        color={colors.reimbursementColor}
      />

      {/* Group trackers */}
      {groups.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>GROUP TRACKERS</Text>
          {groups.map(group => (
            <TrackerToggle
              key={group.id}
              label={group.name}
              subtitle={`${group.members.length} members · auto-split`}
              isActive={trackerState.activeGroupIds.includes(group.id)}
              onToggle={() => toggleGroup(group.id)}
              color={colors.groupColor}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    marginTop: 2,
  },
  activeCount: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCountText: {
    fontSize: 16,
    fontWeight: '800',
  },

  infoCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    gap: 10,
  },
  infoTitle: {
    fontSize: 10,
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  infoIcon: { fontSize: 14, width: 20 },
  infoText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
    marginTop: 4,
  },
});
