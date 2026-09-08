import type { SVGProps } from 'react';

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MOTION_DURATION_S, MOTION_EASING } from '../motion/tokens';
import { reducedMotion } from '../test-utils/motion-react';
import { ProgressRing } from './ProgressRing';

const capturedTransition = vi.hoisted(() => ({ value: undefined as unknown }));

interface MockMotionCircleProps extends SVGProps<SVGCircleElement> {
  initial?: boolean;
  animate?: { strokeDashoffset?: number };
  transition?: unknown;
}

vi.mock('motion/react', async () => {
  const { mockMotionReact } = await import('../test-utils/motion-react');
  return {
    ...(await mockMotionReact()),
    motion: {
      circle: ({
        animate,
        transition,
        initial: _initial,
        ...rest
      }: MockMotionCircleProps) => {
        capturedTransition.value = transition;
        return (
          <circle {...rest} strokeDashoffset={animate?.strokeDashoffset} />
        );
      },
    },
  };
});

afterEach(() => {
  reducedMotion.value = false;
  capturedTransition.value = undefined;
});

describe('ProgressRing motion', () => {
  it('drives the arc from the grow preset by default', () => {
    render(<ProgressRing value={9} max={18} label="Half" />);
    expect(capturedTransition.value).toEqual({
      duration: MOTION_DURATION_S.slow,
      ease: MOTION_EASING.enter,
    });
  });

  it('drives the arc with a zero-duration transition under reduced motion', () => {
    reducedMotion.value = true;
    render(<ProgressRing value={9} max={18} label="Half" />);
    expect(capturedTransition.value).toEqual({ duration: 0 });
  });
});
