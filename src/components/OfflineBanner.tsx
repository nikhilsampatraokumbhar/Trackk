import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useNetwork } from '../store/NetworkContext';
import { useTheme } from '../store/ThemeContext';

/**
 * Slim banner that slides down when offline, shows "Back online" briefly on reconnect.
 * Renders nothing when connected and not recently reconnected.
 */
export default function OfflineBanner() {
  const { isConnected, justReconnected } = useNetwork();
  const { colors } = useTheme();
  const slideAnim = useRef(new Animated.Value(-50)).current;
  const visible = !isConnected || justReconnected;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -50,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!visible) return null;

  const backgroundColor = isConnected ? colors.success : colors.danger;
  const label = isConnected ? 'Back online' : 'You are offline';

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor, transform: [{ translateY: slideAnim }] },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingTop: 48,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
