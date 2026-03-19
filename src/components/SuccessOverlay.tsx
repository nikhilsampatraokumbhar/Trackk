import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../store/ThemeContext';

interface Props {
  visible: boolean;
  message: string;
  subMessage?: string;
  onDone: () => void;
  color?: string;
}

export default function SuccessOverlay({ visible, message, subMessage, onDone, color }: Props) {
  const { colors, isDark } = useTheme();
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset
      scale.setValue(0);
      opacity.setValue(0);
      checkScale.setValue(0);

      Animated.sequence([
        // Fade in backdrop
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        // Pop in the circle
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
        // Pop in the checkmark
        Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        // Hold briefly
        Animated.delay(600),
        // Fade out everything
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => onDone());
    }
  }, [visible]);

  if (!visible) return null;

  const accentColor = color || colors.success;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity,
          backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)',
        },
      ]}
      pointerEvents="none"
    >
      <Animated.View style={[styles.circle, { backgroundColor: `${accentColor}15`, borderColor: `${accentColor}30`, transform: [{ scale }] }]}>
        <Animated.Text style={[styles.check, { color: accentColor, transform: [{ scale: checkScale }] }]}>
          ✓
        </Animated.Text>
      </Animated.View>
      <Animated.Text style={[styles.message, { color: colors.text, transform: [{ scale }] }]}>{message}</Animated.Text>
      {subMessage && (
        <Animated.Text style={[styles.subMessage, { color: colors.textSecondary, transform: [{ scale }] }]}>{subMessage}</Animated.Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  circle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  check: {
    fontSize: 36,
    fontWeight: '700',
  },
  message: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subMessage: {
    fontSize: 13,
    marginTop: 6,
  },
});
