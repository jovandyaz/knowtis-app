import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CARD_STATUS, type StudySessionResult } from '@knowtis/shared-types';

import { FlashcardSummary } from './FlashcardSummary';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));

vi.mock('../focus/SessionCelebration', () => ({
  SessionCelebration: () => <div data-testid="session-celebration" />,
}));

const result: StudySessionResult = {
  correct: 6,
  wrong: 2,
  skipped: 2,
  total: 10,
  durationMs: 90_000,
  cardResults: [
    {
      artifactId: 'artifact-1',
      cardIndex: 0,
      status: CARD_STATUS.WRONG,
      front: 'What is a CRDT?',
      back: 'A conflict-free replicated data type.',
    },
  ],
};

function renderSummary(
  overrides: Partial<Parameters<typeof FlashcardSummary>[0]> = {}
) {
  const props = {
    result,
    onRestart: vi.fn(),
    onBackToNote: vi.fn(),
    ...overrides,
  };
  render(<FlashcardSummary {...props} />);
  return props;
}

describe('FlashcardSummary', () => {
  it('names the donut with the score, every segment count and the time', () => {
    renderSummary();

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
    renderSummary();

    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('6/10')).toBeInTheDocument();
  });

  it('reads the session time back in minutes and seconds', () => {
    renderSummary();

    expect(
      screen.getByText(/summary\.timeSpent .*"minutes":1.*"seconds":30/)
    ).toBeInTheDocument();
  });

  it('reports each outcome as a stat tile', () => {
    renderSummary();

    for (const [label, count] of [
      ['ai.artifacts.flashcards.summary.gotIt', '6'],
      ['ai.artifacts.flashcards.summary.missedIt', '2'],
      ['ai.artifacts.flashcards.summary.skipped', '2'],
    ]) {
      const tile = screen.getByRole('group', { name: label });
      expect(within(tile).getByText(count)).toBeInTheDocument();
    }
  });

  it('heads the summary with the completed session and moves focus to it', () => {
    renderSummary();

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'ai.artifacts.flashcards.summary.sessionComplete',
    });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the motivational line under the heading instead of as the heading', () => {
    renderSummary();

    expect(
      screen.getByText('ai.artifacts.flashcards.summary.goodProgress').tagName
    ).toBe('P');
  });

  it('labels the score as a self-assessment', () => {
    renderSummary();

    expect(
      screen.getByText('ai.artifacts.flashcards.summary.selfAssessment')
    ).toBeInTheDocument();
  });

  it('celebrates the finished session', () => {
    renderSummary();

    expect(screen.getByTestId('session-celebration')).toBeInTheDocument();
  });

  it('returns to the note', async () => {
    const props = renderSummary();

    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.backToNote' })
    );

    expect(props.onBackToNote).toHaveBeenCalledTimes(1);
  });

  it('offers no way back to a note when the caller has none', () => {
    render(<FlashcardSummary result={result} onRestart={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'ai.artifacts.focus.backToNote' })
    ).toBeNull();
  });
});
