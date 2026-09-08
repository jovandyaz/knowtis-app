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
  { value: 6, tone: 'correct' },
  { value: 3, tone: 'incorrect' },
  { value: 1, tone: 'muted' },
];

const DESCRIPTION = '60% correct: got it 6, missed 3, skipped 1.';

describe('DonutChart', () => {
  it('names the chart with the description its consumer wrote', () => {
    render(
      <DonutChart
        segments={[...SEGMENTS]}
        centerLabel="60%"
        centerSublabel="6 of 10"
        description={DESCRIPTION}
      />
    );
    expect(screen.getByRole('img', { name: DESCRIPTION })).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('6 of 10')).toBeInTheDocument();
  });

  it('sizes each arc by its share of the total, drawing the rest of the ring hidden', () => {
    const { container } = render(
      <DonutChart
        segments={[...SEGMENTS]}
        centerLabel="60%"
        description={DESCRIPTION}
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
      <DonutChart
        segments={[...SEGMENTS]}
        centerLabel="60%"
        description={DESCRIPTION}
      />
    );
    const arcs = Array.from(
      container.querySelectorAll('circle[data-segment]')
    ) as SVGCircleElement[];
    expect(arcs[1].style.transform).toBe('rotate(126deg)');
  });

  it('renders an empty ring when every value is zero', () => {
    const { container } = render(
      <DonutChart
        segments={[{ value: 0, tone: 'correct' }]}
        centerLabel="0"
        description="Nothing answered yet."
      />
    );
    expect(container.querySelectorAll('circle[data-segment]')).toHaveLength(0);
  });

  it('never draws a negative arc for a negative segment value', () => {
    const { container } = render(
      <DonutChart
        segments={[
          { value: 10, tone: 'correct' },
          { value: -5, tone: 'incorrect' },
        ]}
        centerLabel="100%"
        description="100% correct: got it 10."
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

  it('paints every arc opaque on the first frame under reduced motion', () => {
    reducedMotion.value = true;
    const { container } = render(
      <DonutChart
        segments={[...SEGMENTS]}
        centerLabel="60%"
        description={DESCRIPTION}
      />
    );
    const arcs = Array.from(container.querySelectorAll('circle[data-segment]'));
    expect(arcs).toHaveLength(3);
    for (const arc of arcs) {
      expect(arc.getAttribute('opacity')).toBe('1');
      expect(arc.getAttribute('stroke-dashoffset')).toBe('0');
    }
  });

  it('hides the centre content from assistive tech, since the svg already carries the name', () => {
    render(
      <DonutChart
        segments={[...SEGMENTS]}
        centerLabel="60%"
        centerSublabel="6 of 10"
        description={DESCRIPTION}
      />
    );
    const centre = screen.getByText('60%').closest('div');
    expect(centre).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders extra centre content as a third line, still hidden from assistive tech', () => {
    render(
      <DonutChart
        segments={[...SEGMENTS]}
        centerLabel="60%"
        centerSublabel="6 of 10"
        description={DESCRIPTION}
      >
        4m 20s
      </DonutChart>
    );
    const extra = screen.getByText('4m 20s');
    expect(extra.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('forwards rest props like id and data attributes to the root div', () => {
    render(
      <DonutChart
        segments={[...SEGMENTS]}
        centerLabel="60%"
        description={DESCRIPTION}
        id="quiz-donut"
        data-testid="donut-root"
      />
    );
    const root = screen.getByTestId('donut-root');
    expect(root).toHaveAttribute('id', 'quiz-donut');
  });
});
