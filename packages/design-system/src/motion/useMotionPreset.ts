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
}

const INSTANT: Transition = Object.freeze({ duration: 0 });

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
      };
    }
    return {
      reduced: false,
      fade: { duration: MOTION_DURATION_S.base, ease: MOTION_EASING.standard },
      slide: { ...SPRING.slide },
      flip: { ...SPRING.flip },
      grow: { duration: MOTION_DURATION_S.slow, ease: MOTION_EASING.enter },
    };
  }, [reduced]);
}
