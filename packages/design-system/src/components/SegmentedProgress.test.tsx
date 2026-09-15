import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reducedMotion } from '../test-utils/motion-react';
import { SegmentedProgress } from './SegmentedProgress';

vi.mock('motion/react', async () =>
  (await import('../test-utils/motion-react')).mockMotionReact()
);
afterEach(() => {
  reducedMotion.value = false;
});

describe('SegmentedProgress', () => {
  it('counts only settled outcomes and forwards the root ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <SegmentedProgress
        ref={ref}
        id="history"
        segments={['correct', 'wrong', 'skipped', 'current', 'pending']}
        label="3 of 5 answered"
      />
    );
    const bar = screen.getByRole('progressbar', { name: '3 of 5 answered' });
    expect(ref.current).toBe(bar);
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '5');
    expect(bar).toHaveAttribute('id', 'history');
    expect(
      [...bar.querySelectorAll('[data-state]')].map((node) =>
        node.getAttribute('data-state')
      )
    ).toEqual(['correct', 'wrong', 'skipped', 'current', 'pending']);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('retains item order in the taller summary track', () => {
    render(
      <SegmentedProgress
        segments={['wrong', 'correct', 'skipped']}
        size="hero"
        label="3 of 3 answered"
      />
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveClass('h-3');
    expect(
      [...bar.querySelectorAll('[data-state]')].map((node) =>
        node.getAttribute('data-state')
      )
    ).toEqual(['wrong', 'correct', 'skipped']);
  });

  it('handles zero items without inventing a completed item', () => {
    render(<SegmentedProgress segments={[]} label="0 of 0 answered" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '0');
    expect(bar.querySelectorAll('[data-state]')).toHaveLength(0);
  });

  it('preserves styling while protecting progress semantics from HTML overrides', () => {
    render(
      <SegmentedProgress
        segments={['current', 'pending']}
        label="0 of 2 answered"
        className="mt-4"
        style={{ width: '75%' }}
        role="meter"
        aria-label="Overridden"
        aria-valuemin={8}
        aria-valuenow={9}
        aria-valuemax={10}
      />
    );
    const bar = screen.getByRole('progressbar', { name: '0 of 2 answered' });
    expect(bar).toHaveClass('h-0.75', 'mt-4');
    expect(bar).toHaveStyle({ width: '75%' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '2');
    for (const segment of bar.querySelectorAll('[data-state]')) {
      expect(segment).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
