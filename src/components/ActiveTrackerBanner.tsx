import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../utils/helpers';

interface ActiveTrackerBannerProps {
  activeCount: number;
  trackerNames: string[];
  onPress: () => void;
}

/**
 * A banner shown at the top of the app when 1 or more trackers are active.
 * Shows a pulsing dot and the names of active trackers.
 * Tapping it opens the tracker settings.
 */
export function ActiveTrackerBanner({
  activeCount,
  trackerNames,
  onPress,
}: ActiveTrackerBannerProps) {
  if (activeCount === 0) return null;

  return (
    <TouchableOpacity style={styles.banner} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.leftSection}>
        <View style={styles.pulsingDot} />
        <View>
          <Text style={styles.title}>
            {activeCount} tracker{activeCount > 1 ? 's' : ''} active
          </Text>
          <Text style={styles.names} numberOfLines={1}>
            {trackerNames.join(' · ')}
          </Text>
        </View>
      </View>
      <Text style={styles.manageText}>Manage</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00FF88',
    marginRight: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  names: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },
  manageText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    textDecorationLine: 'underline',
  },
});
