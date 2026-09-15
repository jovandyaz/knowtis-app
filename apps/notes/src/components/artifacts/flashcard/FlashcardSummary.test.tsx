import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type {
  CardSessionStatus,
  StudySessionResult,
} from '@knowtis/shared-types';

import { FlashcardSummary } from './FlashcardSummary';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));
vi.mock('../focus/SessionCelebration', () => ({
  SessionCelebration: () => <div data-testid="celebration" />,
}));

function resultFor(
  statuses: CardSessionStatus[],
  durationMs = 6000
): StudySessionResult {
  return {
    correct: statuses.filter((status) => status === 'correct').length,
    wrong: statuses.filter((status) => status === 'wrong').length,
    skipped: statuses.filter((status) => status === 'skipped').length,
    total: statuses.length,
    durationMs,
    cardResults: statuses.map((status, cardIndex) => ({
      artifactId: 'deck',
      cardIndex,
      status,
      front: `Question ${cardIndex + 1}`,
      back: `Answer ${cardIndex + 1}`,
    })),
  };
}

describe('FlashcardSummary', () => {
  it('uses every card result in order and focuses the outcome headline', () => {
    render(
      <FlashcardSummary
        result={resultFor(['correct', 'wrong', 'skipped'])}
        onRestart={vi.fn()}
      />
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveAccessibleName(
      'ai.artifacts.flashcards.summary.headline {"correct":1,"total":3}'
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
    expect(
      [...screen.getByRole('progressbar').querySelectorAll('[data-state]')].map(
        (node) => node.getAttribute('data-state')
      )
    ).toEqual(['correct', 'wrong', 'skipped']);
    expect(
      screen.getByRole('heading', {
        name: 'ai.artifacts.flashcards.summary.toRevisit',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Question 2' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Question 3' })
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      durationMs: 6000,
      expected:
        'ai.artifacts.flashcards.summary.inTime {"duration":"ai.artifacts.flashcards.summary.timeSpent {\\"minutes\\":0,\\"seconds\\":\\"06\\"}"}',
    },
    {
      durationMs: 90_000,
      expected:
        'ai.artifacts.flashcards.summary.inTime {"duration":"ai.artifacts.flashcards.summary.timeSpent {\\"minutes\\":1,\\"seconds\\":\\"30\\"}"}',
    },
  ])(
    'formats $durationMs milliseconds into the shared duration line',
    ({ durationMs, expected }) => {
      render(
        <FlashcardSummary
          result={resultFor(['correct'], durationMs)}
          onRestart={vi.fn()}
        />
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
    }
  );

  it('maps each outcome count to its plain-text legend label', () => {
    render(
      <FlashcardSummary
        result={resultFor(['correct', 'wrong', 'correct'])}
        onRestart={vi.fn()}
      />
    );

    expect(
      screen.getByText('2 ai.artifacts.flashcards.summary.gotIt')
    ).toBeInTheDocument();
    expect(
      screen.getByText('1 ai.artifacts.flashcards.summary.missedIt')
    ).toBeInTheDocument();
    expect(
      screen.getByText('0 ai.artifacts.flashcards.summary.skipped')
    ).toBeInTheDocument();
  });

  it.each([
    {
      statuses: ['correct', 'correct'] as CardSessionStatus[],
      celebrates: true,
    },
    {
      statuses: ['correct', 'wrong'] as CardSessionStatus[],
      celebrates: false,
    },
    {
      statuses: ['correct', 'skipped'] as CardSessionStatus[],
      celebrates: false,
    },
    { statuses: [] as CardSessionStatus[], celebrates: false },
  ])(
    'celebrates only a nonempty, entirely recalled run: $statuses',
    ({ statuses, celebrates }) => {
      render(
        <FlashcardSummary result={resultFor(statuses)} onRestart={vi.fn()} />
      );
      expect(screen.queryByTestId('celebration') !== null).toBe(celebrates);
    }
  );

  it('starts missed practice directly and retains note return', async () => {
    const onRestart = vi.fn();
    const onBackToNote = vi.fn();
    render(
      <FlashcardSummary
        result={resultFor(['wrong', 'correct'])}
        onRestart={onRestart}
        onBackToNote={onBackToNote}
      />
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.summary.practiceMissed {"count":1}',
      })
    );
    expect(onRestart).toHaveBeenCalledWith('missed');
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.backToNote' })
    );
    expect(onBackToNote).toHaveBeenCalledTimes(1);
  });

  it('omits note return for an in-page caller without that callback', () => {
    render(
      <FlashcardSummary result={resultFor(['correct'])} onRestart={vi.fn()} />
    );
    expect(
      screen.queryByRole('button', { name: 'ai.artifacts.focus.backToNote' })
    ).not.toBeInTheDocument();
  });
});
