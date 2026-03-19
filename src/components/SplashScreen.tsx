import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { useTheme } from '../store/ThemeContext';
import Logo from './Logo';

const { width } = Dimensions.get('window');

interface SplashScreenProps {
  onAnimationComplete?: () => void;
}

export default function SplashScreen({ onAnimationComplete }: SplashScreenProps) {
  const { colors } = useTheme();

  // Animation values
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const nameTranslateY = useRef(new Animated.Value(12)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(10)).current;
  const descOpacity = useRef(new Animated.Value(0)).current;
  const descTranslateY = useRef(new Animated.Value(10)).current;
  const glowScale = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const lineWidth = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Phase 1: Logo entrance (0-600ms)
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      // Glow pulse behind logo
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(glowScale, {
            toValue: 1,
            duration: 800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();

    // Phase 2: App name (400ms delay)
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(nameOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(nameTranslateY, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Phase 3: Accent line (700ms delay)
    Animated.sequence([
      Animated.delay(700),
      Animated.timing(lineWidth, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // width can't use native driver
      }),
    ]).start();

    // Phase 4: Tagline (800ms delay)
    Animated.sequence([
      Animated.delay(800),
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(taglineTranslateY, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Phase 5: Description (1100ms delay)
    Animated.sequence([
      Animated.delay(1100),
      Animated.parallel([
        Animated.timing(descOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(descTranslateY, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Phase 6: Fade out everything (2800ms delay)
    Animated.sequence([
      Animated.delay(2800),
      Animated.parallel([
        Animated.timing(fadeOut, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        // Glow fades and shrinks
        Animated.timing(glowOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      onAnimationComplete?.();
    });
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.content, { opacity: fadeOut }]}>
        {/* Glow ring behind logo */}
        <Animated.View
          style={[
            styles.glow,
            {
              backgroundColor: colors.primaryGlow,
              borderColor: `${colors.primary}15`,
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
            },
          ]}
        />

        {/* Logo */}
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          }}
        >
          <Logo size={100} />
        </Animated.View>

        {/* App name */}
        <Animated.Text
          style={[
            styles.appName,
            {
              color: colors.text,
              opacity: nameOpacity,
              transform: [{ translateY: nameTranslateY }],
            },
          ]}
        >
          Trackk
        </Animated.Text>

        {/* Accent line */}
        <View style={styles.lineContainer}>
          <Animated.View
            style={[
              styles.accentLine,
              {
                backgroundColor: colors.primary,
                width: lineWidth.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 40],
                }),
              },
            ]}
          />
        </View>

        {/* Tagline */}
        <Animated.Text
          style={[
            styles.tagline,
            {
              color: colors.primary,
              opacity: taglineOpacity,
              transform: [{ translateY: taglineTranslateY }],
            },
          ]}
        >
          One Tap. Track.
        </Animated.Text>

        {/* Description */}
        <Animated.Text
          style={[
            styles.description,
            {
              color: colors.textSecondary,
              opacity: descOpacity,
              transform: [{ translateY: descTranslateY }],
            },
          ]}
        >
          Expenses, splits, investments & goals — all in one place
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    top: -50,
  },
  appName: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 18,
  },
  lineContainer: {
    height: 3,
    marginTop: 14,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentLine: {
    height: 2.5,
    borderRadius: 2,
  },
  tagline: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  description: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 10,
    letterSpacing: 0.3,
    textAlign: 'center',
    maxWidth: width * 0.75,
    lineHeight: 18,
  },
});
