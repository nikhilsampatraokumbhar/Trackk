import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActiveTracker } from '../models/types';
import { useTheme } from '../store/ThemeContext';

interface Props {
  activeTrackers: ActiveTracker[];
  onManage: () => void;
}

export default function ActiveTrackerBanner({ activeTrackers, onManage }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (activeTrackers.length === 0) return null;

  const names = activeTrackers.map(t => t.label).join(' · ');
  return (
    <View style={[styles.banner, {
      paddingTop: insets.top + 11,
      backgroundColor: `${colors.success}12`,
      borderBottomColor: `${colors.success}20`,
    }]}>
      <View style={styles.left}>
        <View style={styles.pulseWrap}>
          <View style={[styles.pulseOuter, { backgroundColor: `${colors.success}25` }]} />
          <View style={[styles.pulse, { backgroundColor: colors.success }]} />
        </View>
        <Text style={styles.text} numberOfLines={1}>
          <Text style={[styles.tracking, { color: colors.textSecondary }]}>Tracking  </Text>
          <Text style={[styles.names, { color: colors.success }]}>{names}</Text>
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.manageBtn, {
          backgroundColor: `${colors.primary}12`,
          borderColor: `${colors.primary}30`,
        }]}
        onPress={onManage}
        activeOpacity={0.7}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={[styles.manageBtnText, { color: colors.primary }]}>Manage</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
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
  },
  pulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tracking: { fontSize: 12 },
  text: { fontSize: 12, flex: 1 },
  names: { fontSize: 12, fontWeight: '600' },
  manageBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  manageBtnText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
