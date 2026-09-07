import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reducedMotion } from '../test-utils/motion-react';
import { FlipCard } from './FlipCard';

vi.mock('motion/react', async () =>
  (await import('../test-utils/motion-react')).mockMotionReact()
);

function renderCard(flipped: boolean, onFlip = vi.fn()) {
  render(
    <FlipCard
      front={<p>Question</p>}
      back={<p>Answer</p>}
      flipped={flipped}
      onFlip={onFlip}
      frontLabel="Show answer"
      backLabel="Show question"
    />
  );
  return onFlip;
}

afterEach(() => {
  reducedMotion.value = false;
});

describe('FlipCard', () => {
  it('names the control after the visible face and describes the flip action', () => {
    const onFlip = renderCard(false);
    const control = screen.getByRole('button', { name: 'Question' });
    expect(control).toHaveAccessibleDescription('Show answer');
    expect(control).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(control);
    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('names the control after the back face and describes returning to the front when flipped', () => {
    renderCard(true);
    const control = screen.getByRole('button', { name: 'Answer' });
    expect(control).toHaveAccessibleDescription('Show question');
    expect(control).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides the front face from assistive tech and reveals the back when flipped', () => {
    renderCard(true);
    const front = screen
      .getByText('Question')
      .closest('[data-face-side="front"]');
    const back = screen.getByText('Answer').closest('[data-face-side="back"]');
    expect(front).toHaveAttribute('aria-hidden', 'true');
    expect(back).toHaveAttribute('aria-hidden', 'false');
  });

  it('renders the full-motion flip face by default, not the reduced-motion stack', () => {
    renderCard(false);
    const control = screen.getByRole('button');
    expect(control.querySelector('[data-face="flip"]')).not.toBeNull();
    expect(control.querySelector('[data-face="stack"]')).toBeNull();
  });

  it('renders without a 3D transform under reduced motion', () => {
    reducedMotion.value = true;
    renderCard(true);
    const control = screen.getByRole('button');
    expect(control.querySelector('[data-face="stack"]')).not.toBeNull();
    expect(control.querySelector('[data-face="flip"]')).toBeNull();
  });

  it('keeps faces in the grid flow instead of absolute positioning, so long content can grow the card', () => {
    renderCard(false);
    const control = screen.getByRole('button');
    const faces = control.querySelectorAll('[data-face-side]');
    expect(faces.length).toBeGreaterThan(0);
    faces.forEach((face) => {
      expect(face.className).not.toMatch(/\babsolute\b/);
    });
  });
});
