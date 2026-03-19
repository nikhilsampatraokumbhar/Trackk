import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Switch } from 'react-native-paper';
import { useTheme } from '../store/ThemeContext';

interface Props {
  label: string;
  subtitle?: string;
  isActive: boolean;
  onToggle: () => void;
  color?: string;
}

export default function TrackerToggle({ label, subtitle, isActive, onToggle, color }: Props) {
  const { colors } = useTheme();
  const activeColor = color || colors.primary;

  return (
    <TouchableOpacity
      style={[styles.container, {
        borderColor: isActive ? `${activeColor}25` : colors.border,
        backgroundColor: colors.surface,
      }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        {/* Icon with dot indicator */}
        <View style={[
          styles.iconWrap,
          { backgroundColor: isActive ? `${activeColor}12` : colors.surfaceHigh },
        ]}>
          <View style={[
            styles.dot,
            { backgroundColor: isActive ? activeColor : colors.textLight },
          ]} />
        </View>

        <View style={styles.textWrap}>
          {label ? (
            <Text style={[styles.label, { color: isActive ? colors.text : colors.textSecondary }]}>{label}</Text>
          ) : null}
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textLight }]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>

      <Switch
        value={isActive}
        onValueChange={onToggle}
        color={activeColor}
      />
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
    borderRadius: 16,
    borderWidth: 1,
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
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.2,
  },
});
