/**
 * Trackk Motion Design System
 *
 * Defines easing curves, spring configurations, duration presets,
 * and reusable animation factory functions.
 *
 * Principles:
 * - Quick in, gentle out (elements arrive fast, settle softly)
 * - Stagger reveals for lists (60ms between items, max 10)
 * - Springs for interactive elements (buttons, cards)
 * - Timing for fades and color transitions
 */

import { Animated, Easing } from 'react-native';

// ─── Duration Presets (ms) ───────────────────────────────────────────────────

export const DURATION: Record<string, number> & {
  instant: number; fast: number; normal: number; medium: number;
  slow: number; pulse: number; dramatic: number;
} = {
  /** 100ms — micro-interactions, press states */
  instant: 100,
  /** 150ms — fades, color changes */
  fast: 150,
  /** 250ms — standard transitions */
  normal: 250,
  /** 400ms — entrance animations */
  medium: 400,
  /** 600ms — counting, number animations */
  slow: 600,
  /** 800ms — skeleton pulse cycle */
  pulse: 800,
  /** 1000ms — splash, onboarding reveals */
  dramatic: 1000,
};

// ─── Easing Curves ───────────────────────────────────────────────────────────

export const EASING = {
  /** Standard ease-out: fast start, soft land */
  out: Easing.out(Easing.cubic),
  /** Standard ease-in: gentle start, fast end */
  in: Easing.in(Easing.cubic),
  /** Smooth in-out: for looping, pulse */
  inOut: Easing.inOut(Easing.cubic),
  /** Overshoot: bouncy entrance for cards */
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
  /** Decelerate: items settling into place */
  decelerate: Easing.out(Easing.poly(4)),
  /** Sharp: snappy UI responses */
  sharp: Easing.bezier(0.4, 0, 0.2, 1),
} as const;

// ─── Spring Configurations ──────────────────────────────────────────────────

export const SPRING = {
  /** Gentle: subtle UI shifts, toggles */
  gentle: { friction: 10, tension: 60, useNativeDriver: true },
  /** Default: card entrances, list items */
  default: { friction: 8, tension: 80, useNativeDriver: true },
  /** Responsive: interactive elements (buttons, FABs) */
  responsive: { friction: 7, tension: 100, useNativeDriver: true },
  /** Bouncy: success overlays, celebrations */
  bouncy: { friction: 5, tension: 120, useNativeDriver: true },
  /** Snappy: press scale, quick feedback */
  snappy: { friction: 6, tension: 150, useNativeDriver: true },
  /** Stiff: immediate response, minimal overshoot */
  stiff: { friction: 12, tension: 200, useNativeDriver: true },
} as const;

// ─── Stagger Config ──────────────────────────────────────────────────────────

export const STAGGER = {
  /** Delay between each item in a staggered list */
  delay: 60,
  /** Max number of items to animate (rest appear instantly) */
  maxItems: 10,
  /** Translate distance for slide-up entrance */
  translateY: 20,
} as const;

// ─── Animation Factories ────────────────────────────────────────────────────

/** Fade in with timing */
export function fadeIn(value: Animated.Value, duration = DURATION.normal) {
  return Animated.timing(value, {
    toValue: 1,
    duration,
    easing: EASING.out,
    useNativeDriver: true,
  });
}

/** Fade out with timing */
export function fadeOut(value: Animated.Value, duration = DURATION.fast) {
  return Animated.timing(value, {
    toValue: 0,
    duration,
    easing: EASING.in,
    useNativeDriver: true,
  });
}

/** Slide up + fade in (entrance animation for a view) */
export function slideUp(
  translateY: Animated.Value,
  opacity: Animated.Value,
  config: { distance?: number; duration?: number } = {},
) {
  const { distance = 20, duration = DURATION.medium } = config;
  translateY.setValue(distance);
  opacity.setValue(0);
  return Animated.parallel([
    Animated.spring(translateY, {
      toValue: 0,
      ...SPRING.default,
    }),
    Animated.timing(opacity, {
      toValue: 1,
      duration,
      easing: EASING.out,
      useNativeDriver: true,
    }),
  ]);
}

/** Scale pop (for badges, success icons) */
export function scalePop(
  value: Animated.Value,
  spring: typeof SPRING.bouncy = SPRING.bouncy,
) {
  value.setValue(0);
  return Animated.spring(value, { toValue: 1, ...spring });
}

/** Pulse loop (for skeletons, loading indicators) */
export function pulseLoop(
  value: Animated.Value,
  { min = 0.3, max = 0.7, duration = DURATION.pulse } = {},
) {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, {
        toValue: max,
        duration,
        easing: EASING.inOut,
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: min,
        duration,
        easing: EASING.inOut,
        useNativeDriver: true,
      }),
    ]),
  );
}

/** Press scale animation pair (press in / release) */
export function pressScale(value: Animated.Value) {
  return {
    pressIn: () => {
      Animated.spring(value, {
        toValue: 0.96,
        ...SPRING.snappy,
      }).start();
    },
    pressOut: () => {
      Animated.spring(value, {
        toValue: 1,
        ...SPRING.snappy,
      }).start();
    },
  };
}

/**
 * Create staggered entrance animations for a list.
 * Returns an array of { translateY, opacity } Animated.Values + a start function.
 */
export function createStaggerEntrance(count: number) {
  const items = Array.from({ length: count }, () => ({
    translateY: new Animated.Value(STAGGER.translateY),
    opacity: new Animated.Value(0),
  }));

  const start = () => {
    const animCount = Math.min(count, STAGGER.maxItems);
    const anims = [];

    for (let i = 0; i < animCount; i++) {
      anims.push(
        Animated.parallel([
          Animated.spring(items[i].translateY, {
            toValue: 0,
            ...SPRING.default,
          }),
          Animated.timing(items[i].opacity, {
            toValue: 1,
            duration: DURATION.normal,
            easing: EASING.out,
            useNativeDriver: true,
          }),
        ]),
      );
    }

    // Show remaining items instantly
    for (let i = animCount; i < count; i++) {
      items[i].translateY.setValue(0);
      items[i].opacity.setValue(1);
    }

    Animated.stagger(STAGGER.delay, anims).start();
  };

  return { items, start };
}

/** Shimmer-like sweep animation value (0 → 1 loop) */
export function shimmerLoop(value: Animated.Value, duration = 1200) {
  return Animated.loop(
    Animated.timing(value, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    }),
  );
}
