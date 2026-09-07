import type { SVGProps } from 'react';

import { render, screen } from '@testing-library/react';
import type * as MotionReact from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProgressRing } from './ProgressRing';

const reducedMotion = vi.hoisted(() => ({ value: false }));
const capturedTransition = vi.hoisted(() => ({ value: undefined as unknown }));

interface MockMotionCircleProps extends SVGProps<SVGCircleElement> {
  initial?: boolean;
  animate?: { strokeDashoffset?: number };
  transition?: unknown;
}

vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof MotionReact>('motion/react');
  return {
    ...actual,
    useReducedMotion: () => reducedMotion.value,
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

  it('floors a non-positive max like Progress does, instead of leaving the ring degenerate', () => {
    const { container } = render(
      <ProgressRing
        value={0}
        max={0}
        label="Empty deck"
        size={40}
        strokeWidth={4}
      />
    );
    const ring = screen.getByRole('progressbar', { name: 'Empty deck' });
    expect(ring).toHaveAttribute('aria-valuemax', '1');
    expect(ring).toHaveAttribute('aria-valuenow', '0');
    const arc = container.querySelector('circle[data-arc]') as SVGCircleElement;
    const circumference = 2 * Math.PI * ((40 - 4) / 2);
    const offset = Number(arc.getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(circumference, 3);
  });

  it('renders centre content', () => {
    render(
      <ProgressRing value={1} max={2} label="x">
        <span>50%</span>
      </ProgressRing>
    );
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('hides the centre content from assistive tech, since the svg already carries the name', () => {
    render(
      <ProgressRing value={1} max={2} label="x">
        <span>50%</span>
      </ProgressRing>
    );
    const centre = screen.getByText('50%').closest('div');
    expect(centre).toHaveAttribute('aria-hidden', 'true');
  });

  it('forwards rest props like id and data attributes to the root div', () => {
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
  });

  it('drives the arc from the grow preset by default', () => {
    render(<ProgressRing value={9} max={18} label="Half" />);
    expect(capturedTransition.value).toEqual({
      duration: 0.4,
      ease: [0, 0, 0.2, 1],
    });
  });

  it('drives the arc with a zero-duration transition under reduced motion', () => {
    reducedMotion.value = true;
    render(<ProgressRing value={9} max={18} label="Half" />);
    expect(capturedTransition.value).toEqual({ duration: 0 });
  });
});
