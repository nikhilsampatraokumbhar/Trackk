import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActiveTracker } from '../models/types';
import { COLORS } from '../utils/helpers';

interface Props {
  activeTrackers: ActiveTracker[];
  onManage: () => void;
}

export default function ActiveTrackerBanner({ activeTrackers, onManage }: Props) {
  const insets = useSafeAreaInsets();

  if (activeTrackers.length === 0) return null;

  const names = activeTrackers.map(t => t.label).join(' · ');
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 11 }]}>
      <View style={styles.left}>
        <View style={styles.pulseWrap}>
          <View style={styles.pulseOuter} />
          <View style={styles.pulse} />
        </View>
        <Text style={styles.text} numberOfLines={1}>
          <Text style={styles.tracking}>Tracking  </Text>
          <Text style={styles.names}>{names}</Text>
        </Text>
      </View>
      <TouchableOpacity
        style={styles.manageBtn}
        onPress={onManage}
        activeOpacity={0.7}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.manageBtnText}>Manage</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: `${COLORS.success}18`,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.success}25`,
  },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  pulseWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  pulseOuter: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: `${COLORS.success}30`,
  },
  pulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  tracking: { fontSize: 12, color: COLORS.textSecondary },
  text: { fontSize: 12, flex: 1 },
  names: { fontSize: 12, fontWeight: '700', color: COLORS.success },
  manageBtn: {
    backgroundColor: `${COLORS.primary}22`,
    borderWidth: 1,
    borderColor: `${COLORS.primary}50`,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  manageBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.3,
  },
});
