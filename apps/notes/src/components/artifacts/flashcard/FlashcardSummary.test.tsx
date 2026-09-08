import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CARD_STATUS, type StudySessionResult } from '@knowtis/shared-types';

import { FlashcardSummary } from './FlashcardSummary';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));

const result: StudySessionResult = {
  correct: 6,
  wrong: 2,
  skipped: 2,
  total: 10,
  durationMs: 90_000,
  cardResults: [
    {
      cardIndex: 0,
      status: CARD_STATUS.WRONG,
      front: 'What is a CRDT?',
      back: 'A conflict-free replicated data type.',
    },
  ],
};

describe('FlashcardSummary', () => {
  it('names the donut with the score, every segment count and the time', () => {
    render(<FlashcardSummary result={result} onRestart={vi.fn()} />);

    const donut = screen.getByRole('img', {
      name: /ai\.artifacts\.flashcards\.summary\.description/,
    });
    expect(donut).toHaveAccessibleName(/"percentage":60/);
    expect(donut).toHaveAccessibleName(/"correct":6/);
    expect(donut).toHaveAccessibleName(/"wrong":2/);
    expect(donut).toHaveAccessibleName(/"skipped":2/);
    expect(donut).toHaveAccessibleName(/summary\.timeSpent/);
  });

  it('scores the whole deck, not just the answered cards', () => {
    render(<FlashcardSummary result={result} onRestart={vi.fn()} />);

    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('6/10')).toBeInTheDocument();
  });

  it('reads the session time back in minutes and seconds', () => {
    render(<FlashcardSummary result={result} onRestart={vi.fn()} />);

    expect(
      screen.getByText(/summary\.timeSpent .*"minutes":1.*"seconds":30/)
    ).toBeInTheDocument();
  });

  it('reports each outcome as a stat tile', () => {
    render(<FlashcardSummary result={result} onRestart={vi.fn()} />);

    for (const [label, count] of [
      ['ai.artifacts.flashcards.summary.gotIt', '6'],
      ['ai.artifacts.flashcards.summary.missedIt', '2'],
      ['ai.artifacts.flashcards.summary.skipped', '2'],
    ]) {
      const tile = screen.getByRole('group', { name: label });
      expect(within(tile).getByText(count)).toBeInTheDocument();
    }
  });
});
