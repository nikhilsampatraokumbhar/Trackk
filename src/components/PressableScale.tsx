import React, { useRef, useCallback } from 'react';
import { Animated, Pressable, ViewStyle, StyleProp } from 'react-native';
import { SPRING } from '../utils/motion';
import { hapticLight } from '../utils/haptics';

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Scale factor when pressed (default 0.96) */
  activeScale?: number;
  /** Trigger light haptic on press (default true) */
  haptic?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * A Pressable wrapper that scales down on press with spring physics
 * and optional haptic feedback. Drop-in replacement for TouchableOpacity
 * on interactive cards, buttons, and list items.
 */
export default function PressableScale({
  children,
  onPress,
  onLongPress,
  style,
  activeScale = 0.96,
  haptic = true,
  disabled = false,
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    if (haptic) hapticLight();
    Animated.spring(scale, {
      toValue: activeScale,
      ...SPRING.snappy,
    }).start();
  }, [activeScale, haptic]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      ...SPRING.snappy,
    }).start();
  }, []);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
