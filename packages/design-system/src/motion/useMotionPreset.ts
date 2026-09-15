import { useMemo } from 'react';

import type { Transition } from 'motion/react';
import { useReducedMotion } from 'motion/react';

import { MOTION_DURATION_S, MOTION_EASING, SPRING } from './tokens';

export interface MotionPreset {
  reduced: boolean;
  fade: Transition;
  slide: Transition;
  flip: Transition;
  grow: Transition;
  /** Per-item delay, in seconds, for a staggered entrance. */
  stagger: number;
  stamp: Transition;
  sortExit: Transition;
  sortEnter: Transition;
  currentPulse: Transition;
}

const INSTANT: Transition = Object.freeze({ duration: 0 });
const CURRENT_PULSE_SLOW_UNITS = 5;

/**
 * Transitions for the study primitives. Under the OS reduced-motion setting
 * every transition is instant, so callers never branch on the setting themselves.
 * The returned object is stable across renders while `reduced` is unchanged.
 */
export function useMotionPreset(): MotionPreset {
  const reduced = useReducedMotion() ?? false;
  return useMemo(() => {
    if (reduced) {
      return {
        reduced: true,
        fade: INSTANT,
        slide: INSTANT,
        flip: INSTANT,
        grow: INSTANT,
        stagger: 0,
        stamp: INSTANT,
        sortExit: INSTANT,
        sortEnter: INSTANT,
        currentPulse: INSTANT,
      };
    }
    return {
      reduced: false,
      fade: { duration: MOTION_DURATION_S.base, ease: MOTION_EASING.standard },
      slide: { ...SPRING.slide },
      flip: { ...SPRING.flip },
      grow: { duration: MOTION_DURATION_S.slow, ease: MOTION_EASING.enter },
      stagger: MOTION_DURATION_S.fast,
      stamp: {
        duration: MOTION_DURATION_S.fast,
        ease: MOTION_EASING.enter,
      },
      sortExit: {
        duration: MOTION_DURATION_S.base,
        ease: MOTION_EASING.exit,
      },
      sortEnter: {
        duration: MOTION_DURATION_S.fast,
        ease: MOTION_EASING.enter,
      },
      currentPulse: {
        duration: CURRENT_PULSE_SLOW_UNITS * MOTION_DURATION_S.slow,
        ease: MOTION_EASING.standard,
        repeat: Infinity,
      },
    };
  }, [reduced]);
}
