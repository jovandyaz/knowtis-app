import type { HTMLAttributes } from 'react';

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MOTION_DURATION_S } from '../motion/tokens';
import { reducedMotion } from '../test-utils/motion-react';
import { SegmentedProgress } from './SegmentedProgress';
import type { SegmentState } from './SegmentedProgress';

interface Captured {
  animate?: Record<string, unknown> | undefined;
  transition?: Record<string, unknown> | undefined;
  initial?: unknown;
}
interface SpanProps extends HTMLAttributes<HTMLSpanElement>, Captured {
  initial?: unknown;
  exit?: unknown;
  'data-state'?: string;
}
const { captured, frames } = vi.hoisted(() => ({
  captured: new Map<string, Captured>(),
  frames: [] as Captured[],
}));
vi.mock('motion/react', async () => ({
  ...(await (await import('../test-utils/motion-react')).mockMotionReact()),
  motion: {
    span: ({
      animate,
      transition,
      initial,
      exit: _exit,
      ...rest
    }: SpanProps) => {
      const frame = { animate, transition, initial };
      captured.set(rest['data-state'] ?? '', frame);
      frames.push(frame);
      return <span {...rest} />;
    },
  },
}));
afterEach(() => {
  reducedMotion.value = false;
  captured.clear();
  frames.length = 0;
});

describe('SegmentedProgress motion', () => {
  it('pulses only the current segment with a two-second cycle', () => {
    render(
      <SegmentedProgress
        segments={['correct', 'current']}
        label="1 of 2 answered"
      />
    );
    expect(captured.get('current')?.animate?.opacity).toEqual([1, 0.55, 1]);
    expect(captured.get('current')?.transition?.opacity).toEqual(
      expect.objectContaining({
        duration: 5 * MOTION_DURATION_S.slow,
        repeat: Infinity,
      })
    );
    expect(captured.get('current')?.initial).toEqual({ opacity: 1 });
    expect(captured.get('correct')?.animate?.opacity).toBe(1);
  });

  it('glows when the same position settles, without replaying on rerender', () => {
    const { rerender } = render(
      <SegmentedProgress segments={['current']} label="0 of 1 answered" />
    );
    rerender(
      <SegmentedProgress segments={['correct']} label="1 of 1 answered" />
    );
    expect(captured.get('correct')?.animate?.boxShadow).toEqual([
      '0 0 8px 2px var(--learn-correct)',
      '0 0 0px 0px var(--learn-correct)',
    ]);
    expect(captured.get('correct')?.transition?.boxShadow).toEqual(
      expect.objectContaining({
        duration: MOTION_DURATION_S.slow,
      })
    );
    const glow = captured.get('correct')?.animate?.boxShadow;
    rerender(<SegmentedProgress segments={['correct']} label="Recorded" />);
    expect(captured.get('correct')?.animate?.opacity).toBe(1);
    expect(captured.get('correct')?.animate?.boxShadow).toBe(glow);
  });

  it('suppresses pulse, glow and stagger under reduced motion', () => {
    reducedMotion.value = true;
    const { rerender } = render(
      <SegmentedProgress segments={['current']} label="0 of 1 answered" />
    );
    expect(captured.get('current')?.animate?.opacity).toBe(1);
    expect(captured.get('current')?.transition).toEqual({ duration: 0 });
    rerender(
      <SegmentedProgress
        segments={['wrong']}
        label="1 of 1 answered"
        size="hero"
      />
    );
    expect(captured.get('wrong')?.animate?.boxShadow).toBe('none');
    expect(captured.get('wrong')?.transition).toEqual({ duration: 0 });
    expect(captured.get('wrong')?.initial).toBe(false);
  });

  it('does not glow for outcomes that are already settled on mount', () => {
    render(
      <SegmentedProgress
        segments={['correct', 'wrong', 'skipped']}
        label="3 of 3 answered"
        size="hero"
      />
    );
    for (const frame of frames) {
      expect(frame.animate?.boxShadow).toBe('none');
    }
  });

  it.each([
    ['pending', 'correct', '--learn-correct'],
    ['pending', 'wrong', '--learn-incorrect'],
    ['pending', 'skipped', '--learn-skipped'],
    ['current', 'correct', '--learn-correct'],
    ['current', 'wrong', '--learn-incorrect'],
    ['current', 'skipped', '--learn-skipped'],
  ] as const)(
    'glows for %s becoming %s, then clears when reset',
    (from, to, token) => {
      const { rerender } = render(
        <SegmentedProgress segments={[from]} label="Unanswered" />
      );
      rerender(<SegmentedProgress segments={[to]} label="Answered" />);
      expect(captured.get(to)?.animate?.boxShadow).toEqual([
        `0 0 8px 2px var(${token})`,
        `0 0 0px 0px var(${token})`,
      ]);
      expect(captured.get(to)?.transition?.opacity).not.toHaveProperty(
        'repeat'
      );
      rerender(<SegmentedProgress segments={[from]} label="Reset" />);
      expect(captured.get(from)?.animate?.boxShadow).toBe('none');
    }
  );

  it('does not glow when one settled outcome is corrected to another', () => {
    const { rerender } = render(
      <SegmentedProgress segments={['wrong']} label="Needs practice" />
    );
    rerender(<SegmentedProgress segments={['correct']} label="Recalled" />);
    expect(captured.get('correct')?.animate?.boxShadow).toBe('none');
  });

  it('does not replay a settled glow after reduced motion is toggled', () => {
    const { rerender } = render(
      <SegmentedProgress segments={['current']} label="Unanswered" />
    );
    rerender(<SegmentedProgress segments={['correct']} label="Answered" />);
    expect(captured.get('correct')?.animate?.boxShadow).toEqual([
      '0 0 8px 2px var(--learn-correct)',
      '0 0 0px 0px var(--learn-correct)',
    ]);

    reducedMotion.value = true;
    rerender(<SegmentedProgress segments={['correct']} label="Answered" />);
    expect(captured.get('correct')?.animate?.boxShadow).toBe('none');

    reducedMotion.value = false;
    rerender(<SegmentedProgress segments={['correct']} label="Answered" />);
    expect(captured.get('correct')?.animate?.boxShadow).toBe('none');
  });

  it.each([1, 3, 100])(
    'finishes a %i-segment hero entrance within 500ms',
    (count) => {
      render(
        <SegmentedProgress
          segments={Array.from(
            { length: count },
            (): SegmentState => 'correct'
          )}
          label="All recalled"
          size="hero"
        />
      );
      const delays = frames.map((frame) => {
        expect(frame.initial).toEqual({ opacity: 0 });
        expect(frame.transition?.opacity).toEqual(
          expect.objectContaining({ duration: MOTION_DURATION_S.base })
        );
        const transition = frame.transition?.opacity as {
          duration: number;
          delay: number;
        };
        expect(transition.delay + transition.duration).toBeLessThanOrEqual(0.5);
        return transition.delay;
      });
      expect(delays[0]).toBe(0);
      if (count > 1) {
        expect(delays.at(-1)).toBeGreaterThan(0);
      }
    }
  );
});
