import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { COLORS } from '../utils/helpers';

interface Props {
  label: string;
  subtitle?: string;
  isActive: boolean;
  onToggle: () => void;
  color?: string;
}

export default function TrackerToggle({ label, subtitle, isActive, onToggle, color }: Props) {
  const activeColor = color || COLORS.primary;

  return (
    <TouchableOpacity
      style={[styles.container, isActive && { borderColor: `${activeColor}25` }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        {/* Icon with line-style icon feel */}
        <View style={[
          styles.iconWrap,
          { backgroundColor: isActive ? `${activeColor}15` : COLORS.glassHigh },
        ]}>
          <View style={[
            styles.dot,
            { backgroundColor: isActive ? activeColor : COLORS.textLight },
          ]} />
        </View>

        <View style={styles.textWrap}>
          {label ? (
            <Text style={[styles.label, isActive && { color: COLORS.text }]}>{label}</Text>
          ) : null}
          {subtitle ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : null}
        </View>
      </View>

      {/* Hume-style circle toggle */}
      <View style={[
        styles.toggleTrack,
        isActive
          ? { backgroundColor: `${activeColor}20`, borderColor: `${activeColor}30` }
          : { backgroundColor: COLORS.glass, borderColor: COLORS.glassBorder },
      ]}>
        <View style={[
          styles.toggleThumb,
          isActive
            ? { backgroundColor: activeColor, transform: [{ translateX: 16 }] }
            : { backgroundColor: COLORS.textLight, transform: [{ translateX: 0 }] },
        ]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glass,
    marginBottom: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  textWrap: { flex: 1 },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  toggleTrack: {
    width: 42,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
});
