import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CardResult } from '@knowtis/shared-types';

import { MissedCardsList } from './MissedCardsList';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const cards: CardResult[] = [
  {
    artifactId: 'deck',
    cardIndex: 0,
    status: 'wrong',
    front: 'Where does photosynthesis happen?',
    back: 'In chloroplasts.',
  },
  {
    artifactId: 'deck',
    cardIndex: 1,
    status: 'skipped',
    front: 'What is chlorophyll?',
    back: 'A pigment.',
  },
];

describe('MissedCardsList', () => {
  it('names a keyboard-operable disclosure and exposes the answer on demand', async () => {
    render(<MissedCardsList cards={cards} />);
    expect(
      screen.getByRole('heading', {
        name: 'ai.artifacts.flashcards.summary.toRevisit',
      })
    ).toBeInTheDocument();
    const row = screen.getByRole('button', {
      name: 'Where does photosynthesis happen?',
    });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(row).toHaveClass('min-h-12', 'focus-visible:ring-2');
    expect(row.firstElementChild).toHaveClass('wrap-anywhere');
    expect(screen.queryByText('In chloroplasts.')).not.toBeInTheDocument();
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('In chloroplasts.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'What is chlorophyll?' })
    ).not.toBeInTheDocument();
  });

  it('has no empty heading when there are no missed cards', () => {
    render(<MissedCardsList cards={cards.slice(1)} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
