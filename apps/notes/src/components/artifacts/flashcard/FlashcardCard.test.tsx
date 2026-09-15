import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as MotionReact from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlashcardCard } from './FlashcardCard';

const reducedMotion = { value: true };

vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof MotionReact>('motion/react');
  return { ...actual, useReducedMotion: () => reducedMotion.value };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));

function renderCard(
  overrides: Partial<Parameters<typeof FlashcardCard>[0]> = {}
) {
  const onFlip = vi.fn();
  render(
    <FlashcardCard
      front="What is a CRDT?"
      back="A conflict-free replicated data type."
      difficulty="medium"
      flipped={false}
      onFlip={onFlip}
      index={0}
      total={2}
      showPile
      {...overrides}
    />
  );
  return { onFlip };
}

describe('FlashcardCard', () => {
  beforeEach(() => {
    reducedMotion.value = true;
  });

  it('names the card after the face on show and flips on activation', async () => {
    const { onFlip } = renderCard();

    const card = screen.getByRole('button', { name: /What is a CRDT\?/ });
    await userEvent.click(card);

    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('describes the card with the hint for the face on show', () => {
    renderCard();

    expect(
      screen.getByRole('button', { name: /What is a CRDT\?/ })
    ).toHaveAccessibleDescription('ai.artifacts.flashcards.showBack');
  });

  it('names the back face once flipped', () => {
    renderCard({ flipped: true });

    expect(
      screen.getByRole('button', {
        name: /A conflict-free replicated data type\./,
      })
    ).toHaveAccessibleDescription('ai.artifacts.flashcards.showFront');
  });

  it('identifies the face and adapts a long answer independently of its question', () => {
    const back = 'A'.repeat(201);
    renderCard({ back, flipped: true, verdict: 'wrong' });
    expect(
      screen.getByText('ai.artifacts.focus.side.answer')
    ).toBeInTheDocument();
    expect(screen.getByText('What is a CRDT?')).toHaveClass(
      'text-2xl',
      'lg:text-3xl',
      'font-serif'
    );
    expect(screen.getByText(back)).toHaveClass(
      'text-lg',
      'lg:text-xl',
      'text-left',
      'font-normal',
      'whitespace-pre-wrap',
      'wrap-anywhere'
    );
    expect(screen.getByText('✗')).toHaveAttribute('aria-hidden', 'true');
    expect(
      screen.getByRole('button', { name: back })
    ).toHaveAccessibleDescription('ai.artifacts.flashcards.showFront');
  });

  it('shows one decorative remaining-card silhouette only when requested', () => {
    const { container, rerender } = render(
      <FlashcardCard
        front="Q"
        back="A"
        difficulty="easy"
        flipped={false}
        onFlip={vi.fn()}
        index={0}
        total={2}
        showPile
      />
    );
    expect(container.querySelectorAll('[data-card-pile]')).toHaveLength(1);
    expect(container.querySelector('[data-card-pile]')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    rerender(
      <FlashcardCard
        front="Q"
        back="A"
        difficulty="easy"
        flipped={false}
        onFlip={vi.fn()}
        index={1}
        total={2}
        showPile={false}
      />
    );
    expect(container.querySelector('[data-card-pile]')).toBeNull();
  });

  it('prints a new verdict once and leaves a recorded verdict static on revisit', async () => {
    reducedMotion.value = false;
    const props = {
      front: 'Q',
      back: 'A',
      difficulty: 'easy',
      flipped: true,
      onFlip: vi.fn(),
      index: 0,
      total: 2,
      showPile: true,
    } as const;
    const { container, rerender } = render(<FlashcardCard {...props} />);
    rerender(<FlashcardCard {...props} verdict="correct" />);
    const stamp = container.querySelector('[data-study-stamp]');
    expect(stamp).toHaveStyle({ transform: 'scale(1.3)' });
    await waitFor(() => expect(stamp).toHaveStyle({ transform: 'none' }));

    rerender(<FlashcardCard {...props} verdict="correct" />);
    expect(stamp).toHaveStyle({ transform: 'none' });
    rerender(<FlashcardCard key="revisit" {...props} verdict="correct" />);
    expect(container.querySelector('[data-study-stamp]')).toHaveStyle({
      transform: 'none',
    });
  });
});
