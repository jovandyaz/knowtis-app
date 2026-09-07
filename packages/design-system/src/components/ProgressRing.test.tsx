import { render, screen } from '@testing-library/react';
import type * as MotionReact from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProgressRing } from './ProgressRing';

const reducedMotion = vi.hoisted(() => ({ value: false }));
vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof MotionReact>('motion/react');
  return { ...actual, useReducedMotion: () => reducedMotion.value };
});

afterEach(() => {
  reducedMotion.value = false;
});

describe('ProgressRing', () => {
  it('exposes progress semantics', () => {
    render(<ProgressRing value={4} max={18} label="4 of 18 cards" />);
    const ring = screen.getByRole('progressbar', { name: '4 of 18 cards' });
    expect(ring).toHaveAttribute('aria-valuenow', '4');
    expect(ring).toHaveAttribute('aria-valuemax', '18');
  });

  it('draws the arc proportionally', () => {
    const { container } = render(
      <ProgressRing value={9} max={18} label="Half" size={40} strokeWidth={4} />
    );
    const arc = container.querySelector('circle[data-arc]') as SVGCircleElement;
    const circumference = 2 * Math.PI * ((40 - 4) / 2);
    expect(Number(arc.getAttribute('stroke-dasharray'))).toBeCloseTo(
      circumference,
      3
    );
    const offset = Number(arc.getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(circumference * (1 - 9 / 18), 3);
  });

  it('renders centre content', () => {
    render(
      <ProgressRing value={1} max={2} label="x">
        <span>50%</span>
      </ProgressRing>
    );
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders the same offset under reduced motion, with no animation path differences', () => {
    reducedMotion.value = true;
    const { container } = render(
      <ProgressRing value={9} max={18} label="Half" size={40} strokeWidth={4} />
    );
    const arc = container.querySelector('circle[data-arc]') as SVGCircleElement;
    const circumference = 2 * Math.PI * ((40 - 4) / 2);
    const offset = Number(arc.getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(circumference * (1 - 9 / 18), 3);
  });
});
