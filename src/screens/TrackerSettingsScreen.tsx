import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import { useTheme } from '../store/ThemeContext';

export default function TrackerSettingsScreen() {
  const { groups } = useGroups();
  const { trackerState, isListening, togglePersonal, toggleReimbursement, toggleGroup, getActiveTrackers } = useTracker();
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);

  const activeTrackers = getActiveTrackers(groups);

  const getSlotColor = (type: string) => {
    if (type === 'personal') return colors.personalColor;
    if (type === 'reimbursement') return colors.reimbursementColor;
    return colors.groupColor;
  };

  const getSlotEmoji = (type: string) => {
    if (type === 'personal') return '💳';
    if (type === 'reimbursement') return '🧾';
    return '👥';
  };

  const getSlotSubtitle = (tracker: { type: string; id: string }) => {
    if (tracker.type === 'personal') return 'Daily spending';
    if (tracker.type === 'reimbursement') return 'Office expenses';
    const group = groups.find(g => g.id === tracker.id);
    return group ? `${group.members.length} members` : 'Group';
  };

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
                ? `${activeTrackers.length} tracker${activeTrackers.length !== 1 ? 's' : ''} running`
                : 'Add a tracker below to start'}
            </Text>
          </View>
        </View>
        <View style={[styles.activeCount, { backgroundColor: isListening ? `${colors.success}25` : colors.surfaceHigher }]}>
          <Text style={[styles.activeCountText, { color: isListening ? colors.success : colors.textLight }]}>
            {activeTrackers.length}/3
          </Text>
        </View>
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
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>Each active tracker gets its own button in the notification</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>3️⃣</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>Up to 3 trackers — tap the right button to route instantly</Text>
        </View>
      </View>

      {/* Active Slots */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>NOTIFICATION SLOTS</Text>

      <View style={styles.slotsContainer}>
        {activeTrackers.map((tracker) => {
          const slotColor = getSlotColor(tracker.type);
          return (
            <View
              key={tracker.id}
              style={[styles.slotCard, { backgroundColor: colors.surface, borderColor: `${slotColor}25`, borderLeftColor: slotColor }]}
            >
              <View style={styles.slotCardLeft}>
                <Text style={styles.slotEmoji}>{getSlotEmoji(tracker.type)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.slotLabel, { color: colors.text }]} numberOfLines={1}>{tracker.label}</Text>
                  <Text style={[styles.slotSub, { color: colors.textSecondary }]}>{getSlotSubtitle(tracker)}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.removeBtn, { backgroundColor: `${colors.danger}08`, borderColor: `${colors.danger}20` }]}
                onPress={() => {
                  if (tracker.type === 'personal') togglePersonal();
                  else if (tracker.type === 'reimbursement') toggleReimbursement();
                  else toggleGroup(tracker.id);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.removeBtnText, { color: colors.danger }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Empty slot placeholders */}
        {Array.from({ length: 3 - activeTrackers.length }).map((_, i) => (
          <TouchableOpacity
            key={`empty-${i}`}
            style={[styles.slotCardEmpty, { borderColor: `${colors.primary}25`, backgroundColor: `${colors.primary}04` }]}
            onPress={() => setShowPicker(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.emptySlotPlus, { color: colors.primary }]}>+</Text>
            <Text style={[styles.emptySlotText, { color: colors.primary }]}>
              {activeTrackers.length === 0 && i === 0 ? 'Add a tracker' : 'Add tracker'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Notification Preview */}
      {activeTrackers.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>NOTIFICATION PREVIEW</Text>
          <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.previewTitle, { color: colors.text }]}>💰 ₹450 debited</Text>
            <Text style={[styles.previewBody, { color: colors.textSecondary }]}>Payment at Swiggy</Text>
            <View style={styles.previewButtons}>
              {activeTrackers.map((tracker) => {
                const emoji = getSlotEmoji(tracker.type);
                return (
                  <View
                    key={tracker.id}
                    style={[styles.previewBtn, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}20` }]}
                  >
                    <Text style={[styles.previewBtnText, { color: colors.primary }]}>{emoji} {tracker.label}</Text>
                  </View>
                );
              })}
              {activeTrackers.length < 3 && (
                <View style={[styles.previewBtn, { backgroundColor: `${colors.danger}08`, borderColor: `${colors.danger}20` }]}>
                  <Text style={[styles.previewBtnText, { color: colors.danger }]}>❌ Ignore</Text>
                </View>
              )}
            </View>
          </View>
        </>
      )}

      {/* Tracker Picker Modal */}
      <Modal visible={showPicker} animationType="slide" transparent onRequestClose={() => setShowPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowPicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.surfaceHigher }]} />
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Add Tracker</Text>
            <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>Choose what to track in notifications</Text>

            {!trackerState.personal && (
              <TouchableOpacity
                style={[styles.pickerOption, { borderColor: `${colors.personalColor}20`, backgroundColor: `${colors.personalColor}05` }]}
                onPress={() => { togglePersonal(); setShowPicker(false); }}
                activeOpacity={0.7}
              >
                <View style={[styles.pickerDot, { backgroundColor: colors.personalColor }]} />
                <Text style={styles.pickerEmoji}>💳</Text>
                <View style={styles.pickerOptionText}>
                  <Text style={[styles.pickerOptionLabel, { color: colors.text }]}>Personal Expenses</Text>
                  <Text style={[styles.pickerOptionSub, { color: colors.textSecondary }]}>Daily spending</Text>
                </View>
              </TouchableOpacity>
            )}

            {!trackerState.reimbursement && (
              <TouchableOpacity
                style={[styles.pickerOption, { borderColor: `${colors.reimbursementColor}20`, backgroundColor: `${colors.reimbursementColor}05` }]}
                onPress={() => { toggleReimbursement(); setShowPicker(false); }}
                activeOpacity={0.7}
              >
                <View style={[styles.pickerDot, { backgroundColor: colors.reimbursementColor }]} />
                <Text style={styles.pickerEmoji}>🧾</Text>
                <View style={styles.pickerOptionText}>
                  <Text style={[styles.pickerOptionLabel, { color: colors.text }]}>Reimbursement</Text>
                  <Text style={[styles.pickerOptionSub, { color: colors.textSecondary }]}>Office expenses</Text>
                </View>
              </TouchableOpacity>
            )}

            {groups.filter(g => !trackerState.activeGroupIds.includes(g.id) && !g.archived).length > 0 && (
              <>
                <Text style={[styles.pickerSectionTitle, { color: colors.textSecondary }]}>GROUPS</Text>
                {groups
                  .filter(g => !trackerState.activeGroupIds.includes(g.id) && !g.archived)
                  .map(g => (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.pickerOption, { borderColor: `${colors.groupColor}20`, backgroundColor: `${colors.groupColor}05` }]}
                      onPress={() => { toggleGroup(g.id); setShowPicker(false); }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.pickerDot, { backgroundColor: colors.groupColor }]} />
                      <Text style={styles.pickerEmoji}>👥</Text>
                      <View style={styles.pickerOptionText}>
                        <Text style={[styles.pickerOptionLabel, { color: colors.text }]}>{g.name}</Text>
                        <Text style={[styles.pickerOptionSub, { color: colors.textSecondary }]}>{g.members.length} members</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                }
              </>
            )}

            <TouchableOpacity style={styles.pickerCancel} onPress={() => setShowPicker(false)}>
              <Text style={[styles.pickerCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusTitle: { fontSize: 14, fontWeight: '700' },
  statusSub: { fontSize: 12, marginTop: 2 },
  activeCount: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCountText: { fontSize: 14, fontWeight: '800' },

  infoCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    gap: 10,
  },
  infoTitle: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700', marginBottom: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoIcon: { fontSize: 14, width: 20 },
  infoText: { fontSize: 13, flex: 1, lineHeight: 18 },

  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12, marginTop: 4 },

  /* Slot cards */
  slotsContainer: { gap: 8 },
  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  slotCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  slotEmoji: { fontSize: 22 },
  slotLabel: { fontSize: 15, fontWeight: '600' },
  slotSub: { fontSize: 12, marginTop: 1 },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  removeBtnText: { fontSize: 12, fontWeight: '600' },
  slotCardEmpty: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptySlotPlus: { fontSize: 20, fontWeight: '300' },
  emptySlotText: { fontSize: 14, fontWeight: '500' },

  /* Notification preview */
  previewCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  previewTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  previewBody: { fontSize: 12, marginBottom: 14 },
  previewButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  previewBtnText: { fontSize: 12, fontWeight: '600' },

  /* Picker modal */
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, maxHeight: '70%' },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  pickerTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  pickerSub: { fontSize: 13, marginBottom: 18 },
  pickerSectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 14, marginBottom: 10 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 12 },
  pickerDot: { width: 8, height: 8, borderRadius: 4 },
  pickerEmoji: { fontSize: 20 },
  pickerOptionText: { flex: 1 },
  pickerOptionLabel: { fontSize: 15, fontWeight: '600', marginBottom: 1 },
  pickerOptionSub: { fontSize: 12 },
  pickerCancel: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  pickerCancelText: { fontSize: 14, fontWeight: '500' },
});
