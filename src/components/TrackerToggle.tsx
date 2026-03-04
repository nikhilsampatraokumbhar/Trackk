import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../utils/helpers';

interface TrackerToggleProps {
  label: string;
  subtitle?: string;
  isActive: boolean;
  color: string;
  onToggle: () => void;
}

/**
 * NeoPOP-inspired tracker toggle.
 * Active state: colored left stripe + tinted background.
 * Inactive state: flat dark surface, muted text.
 */
export function TrackerToggle({ label, subtitle, isActive, color, onToggle }: TrackerToggleProps) {
  return (
    <TouchableOpacity
      style={[styles.container, isActive && { borderColor: color + '40' }]}
      onPress={onToggle}
      activeOpacity={0.7}>

      {/* Accent stripe — only visible when active */}
      <View style={[styles.stripe, { backgroundColor: isActive ? color : 'transparent' }]} />

      <View style={styles.body}>
        <View style={styles.textBlock}>
          <Text style={[styles.label, isActive && { color: COLORS.text }]}>{label}</Text>
          {subtitle && (
            <Text style={styles.subtitle}>{subtitle}</Text>
          )}
        </View>

        {/* Status badge */}
        <View style={[styles.badge, isActive ? { backgroundColor: color + '20' } : styles.badgeOff]}>
          <Text style={[styles.badgeText, isActive ? { color } : styles.badgeTextOff]}>
            {isActive ? 'ON' : 'OFF'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginVertical: 4,
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  stripe: {
    width: 3,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  textBlock: { flex: 1, marginRight: 12 },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 2,
    fontWeight: '500',
  },
  badge: {
    borderRadius: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeOff: {
    backgroundColor: COLORS.border,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  badgeTextOff: {
    color: COLORS.textLight,
  },
});
