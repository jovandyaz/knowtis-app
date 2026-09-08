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
    onRestart: vi.fn(),
    ...overrides,
  };
  render(<PracticeAgainButton {...props} />);
  return props;
}

describe('PracticeAgainButton', () => {
  it('gives the plain button a 44px touch target and restarts every card', async () => {
    const props = renderButton();

    const button = screen.getByRole('button', {
      name: 'ai.artifacts.flashcards.summary.practiceAgain',
    });
    expect(button).toHaveClass('min-h-11');

    await userEvent.click(button);

    expect(props.onRestart).toHaveBeenCalledWith('all');
  });

  it('gives the trigger button a 44px touch target when filters are available', () => {
    renderButton({ hasMissedCards: true });

    expect(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.summary.practiceAgain',
      })
    ).toHaveClass('min-h-11');
  });
});
