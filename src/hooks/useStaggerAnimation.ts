import { useRef, useEffect } from 'react';
import { Animated } from 'react-native';
import { SPRING, STAGGER, DURATION, EASING } from '../utils/motion';

/**
 * Returns an array of animated values for staggered list entry.
 * Each item fades in and slides up with a slight delay.
 * Uses the centralized motion design system for consistent feel.
 */
export function useStaggerAnimation(itemCount: number, trigger: boolean = true) {
  const animations = useRef<Animated.Value[]>([]);
  const opacities = useRef<Animated.Value[]>([]);

  // Ensure we have enough animated values
  while (animations.current.length < itemCount) {
    animations.current.push(new Animated.Value(STAGGER.translateY));
    opacities.current.push(new Animated.Value(0));
  }

  useEffect(() => {
    if (!trigger || itemCount === 0) return;

    // Reset all values
    for (let i = 0; i < itemCount; i++) {
      animations.current[i].setValue(STAGGER.translateY);
      opacities.current[i].setValue(0);
    }

    // Staggered animation - max items to avoid performance issues
    const count = Math.min(itemCount, STAGGER.maxItems);
    const anims = [];
    for (let i = 0; i < count; i++) {
      anims.push(
        Animated.parallel([
          Animated.spring(animations.current[i], {
            toValue: 0,
            ...SPRING.default,
          }),
          Animated.timing(opacities.current[i], {
            toValue: 1,
            duration: DURATION.normal,
            easing: EASING.out,
            useNativeDriver: true,
          }),
        ]),
      );
    }

    // For items beyond max, show immediately
    for (let i = count; i < itemCount; i++) {
      animations.current[i].setValue(0);
      opacities.current[i].setValue(1);
    }

    Animated.stagger(STAGGER.delay, anims).start();
  }, [itemCount, trigger]);

  return {
    getStyle: (index: number) => {
      if (index >= animations.current.length) return {};
      return {
        transform: [{ translateY: animations.current[index] }],
        opacity: opacities.current[index],
      };
    },
  };
}
