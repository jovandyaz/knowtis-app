import type * as MotionReact from 'motion/react';
import { vi } from 'vitest';

/** Mutable OS reduced-motion setting; reset it in `afterEach`. */
export const reducedMotion = { value: false };

/**
 * Factory for `vi.mock('motion/react', …)`: the real module with
 * `useReducedMotion` reading `reducedMotion.value`, so a test can flip the OS
 * setting without re-declaring the mock.
 */
export async function mockMotionReact(): Promise<typeof MotionReact> {
  const actual = await vi.importActual<typeof MotionReact>('motion/react');
  return { ...actual, useReducedMotion: () => reducedMotion.value };
}
