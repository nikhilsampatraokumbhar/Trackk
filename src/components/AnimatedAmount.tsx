import React, { useEffect, useRef } from 'react';
import { Animated, TextStyle, StyleSheet } from 'react-native';
import { formatCurrency } from '../utils/helpers';

interface Props {
  value: number;
  style?: TextStyle | TextStyle[];
  duration?: number;
}

/**
 * Animates a currency amount from its previous value to the new value.
 * Creates a smooth counting-up/down effect like CRED.
 */
export default function AnimatedAmount({ value, style, duration = 600 }: Props) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const previousValue = useRef(0);
  const displayValue = useRef('₹0.00');

  // Track the current animated number for display
  const currentDisplay = useRef(new Animated.Value(value)).current;

  useEffect(() => {
    const from = previousValue.current;
    const to = value;
    previousValue.current = value;

    if (from === to) {
      displayValue.current = formatCurrency(to);
      return;
    }

    animatedValue.setValue(0);
    Animated.timing(animatedValue, {
      toValue: 1,
      duration,
      useNativeDriver: false, // We need to interpolate text
    }).start();

    // Update the Animated.Value for text interpolation
    currentDisplay.setValue(from);
    Animated.timing(currentDisplay, {
      toValue: to,
      duration,
      useNativeDriver: false,
    }).start();
  }, [value]);

  // Map the animated value to formatted text
  const animatedText = currentDisplay.interpolate({
    inputRange: [Math.min(0, value), Math.max(1, value)],
    outputRange: [formatCurrency(Math.min(0, value)), formatCurrency(Math.max(1, value))],
  });

  // For simplicity and reliability, use a listener approach
  const [displayText, setDisplayText] = React.useState(formatCurrency(value));

  useEffect(() => {
    const id = currentDisplay.addListener(({ value: v }) => {
      setDisplayText(formatCurrency(Math.round(v * 100) / 100));
    });
    return () => currentDisplay.removeListener(id);
  }, []);

  useEffect(() => {
    // Ensure final value is exact
    const timer = setTimeout(() => setDisplayText(formatCurrency(value)), duration + 50);
    return () => clearTimeout(timer);
  }, [value]);

  const flatStyle = Array.isArray(style) ? StyleSheet.flatten(style) : style;

  return (
    <Animated.Text style={flatStyle}>
      {displayText}
    </Animated.Text>
  );
}
