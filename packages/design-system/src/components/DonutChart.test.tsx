import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reducedMotion } from '../test-utils/motion-react';
import type { DonutSegment } from './DonutChart';
import { DONUT_SIZE_DEFAULT, DONUT_STROKE, DonutChart } from './DonutChart';

vi.mock('motion/react', async () =>
  (await import('../test-utils/motion-react')).mockMotionReact()
);

afterEach(() => {
  reducedMotion.value = false;
});

const SEGMENTS: DonutSegment[] = [
  { value: 6, tone: 'correct', label: 'Got it' },
  { value: 3, tone: 'incorrect', label: 'Missed' },
  { value: 1, tone: 'muted', label: 'Skipped' },
];

describe('DonutChart', () => {
  it('describes the whole chart to assistive tech, sublabel included', () => {
    render(
      <DonutChart
        segments={[...SEGMENTS]}
        centerLabel="60%"
        centerSublabel="6 of 10"
      />
    );
    expect(
      screen.getByRole('img', {
        name: '60% (6 of 10): Got it 6, Missed 3, Skipped 1',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('6 of 10')).toBeInTheDocument();
  });

  it('describes the chart without a sublabel when none is given', () => {
    render(<DonutChart segments={[...SEGMENTS]} centerLabel="60%" />);
    expect(
      screen.getByRole('img', { name: '60%: Got it 6, Missed 3, Skipped 1' })
    ).toBeInTheDocument();
  });

  it('sizes each arc by its share of the total, drawing the rest of the ring hidden', () => {
    const { container } = render(
      <DonutChart
        segments={[...SEGMENTS]}
        centerLabel="60%"
        size={DONUT_SIZE_DEFAULT}
      />
    );
    const arcs = container.querySelectorAll('circle[data-segment]');
    expect(arcs).toHaveLength(3);
    const circumference =
      2 * Math.PI * ((DONUT_SIZE_DEFAULT - DONUT_STROKE) / 2);
    const [first] = Array.from(arcs).map(
      (c) => c.getAttribute('stroke-dasharray')?.split(' ').map(Number) ?? []
    );
    expect(first[0] / circumference).toBeCloseTo(0.6, 2);
    expect(first[1]).toBeCloseTo(circumference, 3);
  });

  it('rotates each arc to start where the previous one ended', () => {
    const { container } = render(
      <DonutChart segments={[...SEGMENTS]} centerLabel="60%" />
    );
    const arcs = Array.from(
      container.querySelectorAll('circle[data-segment]')
    ) as SVGCircleElement[];
    expect(arcs[1].style.transform).toBe('rotate(126deg)');
  });

  it('renders an empty ring when every value is zero', () => {
    const { container } = render(
      <DonutChart
        segments={[{ value: 0, tone: 'correct', label: 'Got it' }]}
        centerLabel="0"
      />
    );
    expect(container.querySelectorAll('circle[data-segment]')).toHaveLength(0);
  });

  it('never draws a negative arc for a negative segment value', () => {
    const { container } = render(
      <DonutChart
        segments={[
          { value: 10, tone: 'correct', label: 'Got it' },
          { value: -5, tone: 'incorrect', label: 'Missed' },
        ]}
        centerLabel="100%"
      />
    );
    const arcs = container.querySelectorAll('circle[data-segment]');
    expect(arcs).toHaveLength(1);
    const [length, rest] = (arcs[0].getAttribute('stroke-dasharray') ?? '')
      .split(' ')
      .map(Number);
    expect(length).toBeGreaterThan(0);
    expect(rest).toBeGreaterThan(0);
    expect(length).toBeCloseTo(rest, 3);
  });

  it('renders every arc immediately under reduced motion, with no zero-opacity inline style', () => {
    reducedMotion.value = true;
    const { container } = render(
      <DonutChart segments={[...SEGMENTS]} centerLabel="60%" />
    );
    const arcs = Array.from(container.querySelectorAll('circle[data-segment]'));
    expect(arcs).toHaveLength(3);
    for (const arc of arcs) {
      expect((arc as SVGCircleElement).style.opacity).not.toBe('0');
    }
  });

  it('hides the centre content from assistive tech, since the svg already carries the name', () => {
    render(
      <DonutChart
        segments={[...SEGMENTS]}
        centerLabel="60%"
        centerSublabel="6 of 10"
      />
    );
    const centre = screen.getByText('60%').closest('div');
    expect(centre).toHaveAttribute('aria-hidden', 'true');
  });
});
