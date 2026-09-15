import { render } from '@testing-library/react';
import type * as MotionReact from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionCelebration } from './SessionCelebration';

const reducedMotion = { value: false };
vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof MotionReact>('motion/react');
  return { ...actual, useReducedMotion: () => reducedMotion.value };
});

describe('SessionCelebration', () => {
  beforeEach(() => vi.clearAllMocks());
  it('renders a hidden burst of pieces', () => {
    reducedMotion.value = false;
    const { container } = render(<SessionCelebration />);
    const burst = container.firstElementChild;
    expect(burst).toHaveAttribute('aria-hidden', 'true');
    expect(burst?.childElementCount).toBeGreaterThan(0);
  });

  it('renders nothing under reduced motion', () => {
    reducedMotion.value = true;
    const { container } = render(<SessionCelebration />);
    expect(container).toBeEmptyDOMElement();
  });
});
