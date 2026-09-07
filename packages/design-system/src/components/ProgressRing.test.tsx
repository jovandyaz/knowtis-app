import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reducedMotion } from '../test-utils/motion-react';
import { ProgressRing } from './ProgressRing';

vi.mock('motion/react', async () =>
  (await import('../test-utils/motion-react')).mockMotionReact()
);

afterEach(() => {
  reducedMotion.value = false;
});

const RING_SIZE = 40;
const RING_STROKE = 4;
const CIRCUMFERENCE = 2 * Math.PI * ((RING_SIZE - RING_STROKE) / 2);

describe('ProgressRing', () => {
  it('carries the progress semantics on the root, leaving the svg decorative', () => {
    render(
      <ProgressRing
        value={4}
        max={18}
        label="4 of 18 cards"
        data-testid="ring-root"
      />
    );
    const ring = screen.getByRole('progressbar', { name: '4 of 18 cards' });
    expect(ring).toBe(screen.getByTestId('ring-root'));
    expect(ring.tagName).toBe('DIV');
    expect(ring).toHaveAttribute('aria-valuemin', '0');
    expect(ring).toHaveAttribute('aria-valuenow', '4');
    expect(ring).toHaveAttribute('aria-valuemax', '18');
    expect(ring.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws the arc proportionally', () => {
    const { container } = render(
      <ProgressRing
        value={9}
        max={18}
        label="Half"
        size={RING_SIZE}
        strokeWidth={RING_STROKE}
      />
    );
    const arc = container.querySelector('circle[data-arc]') as SVGCircleElement;
    expect(Number(arc.getAttribute('stroke-dasharray'))).toBeCloseTo(
      CIRCUMFERENCE,
      3
    );
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      CIRCUMFERENCE * (1 - 9 / 18),
      3
    );
  });

  it('floors a non-positive max like Progress does, instead of leaving the ring degenerate', () => {
    const { container } = render(
      <ProgressRing
        value={0}
        max={0}
        label="Empty deck"
        size={RING_SIZE}
        strokeWidth={RING_STROKE}
      />
    );
    const ring = screen.getByRole('progressbar', { name: 'Empty deck' });
    expect(ring).toHaveAttribute('aria-valuemax', '1');
    expect(ring).toHaveAttribute('aria-valuenow', '0');
    const arc = container.querySelector('circle[data-arc]') as SVGCircleElement;
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      CIRCUMFERENCE,
      3
    );
  });

  it('renders centre content without letting it pollute the progressbar name', () => {
    render(
      <ProgressRing value={1} max={2} label="1 of 2 cards">
        <span>50%</span>
      </ProgressRing>
    );
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: '1 of 2 cards' })
    ).toBeInTheDocument();
  });

  it('hides the centre overlay from assistive tech, keeping the root name', () => {
    render(
      <ProgressRing value={1} max={2} label="1 of 2 cards">
        <span>50%</span>
      </ProgressRing>
    );
    expect(screen.getByText('50%').closest('div')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(
      screen.getByRole('progressbar', { name: '1 of 2 cards' })
    ).toBeInTheDocument();
  });

  it('forwards rest props like id and data attributes to the root progressbar', () => {
    render(
      <ProgressRing
        value={4}
        max={18}
        label="4 of 18 cards"
        id="deck-progress"
        data-testid="ring-root"
        aria-describedby="deck-hint"
      />
    );
    const root = screen.getByTestId('ring-root');
    expect(root).toHaveAttribute('id', 'deck-progress');
    expect(root).toHaveAttribute('aria-describedby', 'deck-hint');
    expect(root).toHaveAttribute('role', 'progressbar');
  });

  it('keeps a caller style while still sizing itself', () => {
    render(
      <ProgressRing
        value={4}
        max={18}
        label="4 of 18 cards"
        size={RING_SIZE}
        style={{ marginTop: 8 }}
        data-testid="ring-root"
      />
    );
    const root = screen.getByTestId('ring-root');
    expect(root.style.marginTop).toBe('8px');
    expect(root.style.width).toBe('40px');
    expect(root.style.height).toBe('40px');
  });
});
