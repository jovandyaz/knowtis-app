import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PracticeAgainButton } from './PracticeAgainButton';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));

function renderButton(
  overrides: Partial<Parameters<typeof PracticeAgainButton>[0]> = {}
) {
  const props = {
    hasMissedCards: false,
    hasSkippedCards: false,
    missedCount: 0,
    onRestart: vi.fn(),
    ...overrides,
  };
  render(<PracticeAgainButton {...props} />);
  return props;
}

describe('PracticeAgainButton', () => {
  it('gives the plain button a 48px target and restarts every card', async () => {
    const props = renderButton();

    const button = screen.getByRole('button', {
      name: 'ai.artifacts.flashcards.summary.practiceAgain',
    });
    expect(button).toHaveClass('min-h-12');

    await userEvent.click(button);

    expect(props.onRestart).toHaveBeenCalledWith('all');
  });

  it('gives the trigger button a 48px target when filters are available', () => {
    renderButton({ hasMissedCards: true, missedCount: 2 });

    expect(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.summary.practiceOptions',
      })
    ).toHaveClass('min-h-12');
  });

  it('directly practices the missed count while its menu retains all three filters', async () => {
    const props = renderButton({
      hasMissedCards: true,
      hasSkippedCards: true,
      missedCount: 2,
    });
    await userEvent.click(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.summary.practiceMissed {"count":2}',
      })
    );
    expect(props.onRestart).toHaveBeenLastCalledWith('missed');
    for (const [key, filter] of [
      ['allCards', 'all'],
      ['onlyMissed', 'missed'],
      ['onlySkipped', 'skipped'],
    ] as const) {
      await userEvent.click(
        screen.getByRole('button', {
          name: 'ai.artifacts.flashcards.summary.practiceOptions',
        })
      );
      await userEvent.click(
        await screen.findByRole('menuitem', {
          name: `ai.artifacts.flashcards.summary.${key}`,
        })
      );
      expect(props.onRestart).toHaveBeenLastCalledWith(filter);
    }
  });

  it('keeps all-card practice as primary when the only unsettled recall outcome is skipped', async () => {
    const props = renderButton({ hasSkippedCards: true });
    await userEvent.click(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.summary.practiceAgain',
      })
    );
    expect(props.onRestart).toHaveBeenCalledWith('all');
    await userEvent.click(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.summary.practiceOptions',
      })
    );
    expect(
      screen.queryByRole('menuitem', {
        name: 'ai.artifacts.flashcards.summary.onlyMissed',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {
        name: 'ai.artifacts.flashcards.summary.onlySkipped',
      })
    ).toBeInTheDocument();
  });
});
