import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MOTION_DURATION_S } from './tokens';
import { useMotionPreset } from './useMotionPreset';

const reducedMotion = vi.hoisted(() => ({ value: false as boolean | null }));

vi.mock('motion/react', () => ({
  useReducedMotion: () => reducedMotion.value,
}));

describe('useMotionPreset', () => {
  it('returns token-timed transitions when motion is allowed', () => {
    reducedMotion.value = false;
    const { result } = renderHook(() => useMotionPreset());
    expect(result.current.reduced).toBe(false);
    expect(result.current.fade).toEqual({
      duration: MOTION_DURATION_S.base,
      ease: [0.2, 0, 0, 1],
    });
    expect(result.current.slide).toEqual({
      type: 'spring',
      stiffness: 400,
      damping: 30,
    });
    expect(result.current.flip).toEqual({
      type: 'spring',
      stiffness: 300,
      damping: 25,
    });
    expect(result.current.grow).toEqual({
      duration: MOTION_DURATION_S.slow,
      ease: [0, 0, 0.2, 1],
    });
    expect(result.current.stagger).toBe(MOTION_DURATION_S.fast);
  });

  it('collapses every transition to zero duration under reduced motion', () => {
    reducedMotion.value = true;
    const { result } = renderHook(() => useMotionPreset());
    expect(result.current.reduced).toBe(true);
    for (const key of ['fade', 'slide', 'flip', 'grow'] as const) {
      expect(result.current[key]).toEqual({ duration: 0 });
    }
    expect(result.current.stagger).toBe(0);
  });

  it('treats an unknown OS preference as motion allowed', () => {
    reducedMotion.value = null;
    const { result } = renderHook(() => useMotionPreset());
    expect(result.current.reduced).toBe(false);
    expect(result.current.fade).toEqual({
      duration: MOTION_DURATION_S.base,
      ease: [0.2, 0, 0, 1],
    });
  });

  it('keeps the same preset reference across rerenders while reduced is unchanged', () => {
    reducedMotion.value = false;
    const { result, rerender } = renderHook(() => useMotionPreset());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
