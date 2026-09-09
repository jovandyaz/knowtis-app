import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FlashcardCard } from './FlashcardCard';

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
      {...overrides}
    />
  );
  return { onFlip };
}

describe('FlashcardCard', () => {
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

  it('reads the difficulty badge with the AA-contrast text token', () => {
    renderCard();

    const badge = screen.getByText('ai.artifacts.flashcards.difficulty.medium');
    expect(badge).toHaveClass('text-learn-difficulty-medium-text');
    expect(badge).toHaveClass('bg-learn-difficulty-medium/10');
  });
});
