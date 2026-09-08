import { render, screen } from '@testing-library/react';
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
  skipped: 1,
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

function statTile(label: string): HTMLElement {
  const tile = screen.getByText(label).closest('div')?.parentElement;
  if (!tile) {
    throw new Error(`No stat tile around "${label}"`);
  }
  return tile;
}

describe('FlashcardSummary', () => {
  it('names the donut with the score and every segment count', () => {
    render(<FlashcardSummary result={result} onRestart={vi.fn()} />);

    const donut = screen.getByRole('img', {
      name: /ai\.artifacts\.flashcards\.summaryDescription/,
    });
    expect(donut).toHaveAccessibleName(/"percentage":75/);
    expect(donut).toHaveAccessibleName(/"correct":6/);
    expect(donut).toHaveAccessibleName(/"wrong":2/);
    expect(donut).toHaveAccessibleName(/"skipped":1/);
  });

  it('reports each outcome as a stat tile', () => {
    render(<FlashcardSummary result={result} onRestart={vi.fn()} />);

    for (const [label, count] of [
      ['ai.artifacts.flashcards.summary.gotIt', '6'],
      ['ai.artifacts.flashcards.summary.missedIt', '2'],
      ['ai.artifacts.flashcards.summary.skipped', '1'],
    ]) {
      expect(statTile(label).textContent).toBe(`${label}${count}`);
    }
  });
});
