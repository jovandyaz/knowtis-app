import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SM2_QUALITY } from '@knowtis/shared-types';

import { FlashcardRating } from './FlashcardRating';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));

function renderRating(
  overrides: Partial<Parameters<typeof FlashcardRating>[0]> = {}
) {
  const props = {
    isAdvancedMode: false,
    readOnly: false,
    onWrong: vi.fn(),
    onCorrect: vi.fn(),
    onRateAdvanced: vi.fn(),
    disabled: false,
    ...overrides,
  };
  render(<FlashcardRating {...props} />);
  return props;
}

describe('FlashcardRating', () => {
  it('rates correct and wrong in simple mode', async () => {
    const props = renderRating();

    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.correct' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.wrong' })
    );

    expect(props.onCorrect).toHaveBeenCalledTimes(1);
    expect(props.onWrong).toHaveBeenCalledTimes(1);
    expect(props.onRateAdvanced).not.toHaveBeenCalled();
  });

  it('keeps each tone button coloured under the ghost hover rule', () => {
    renderRating();

    expect(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.wrong' })
    ).toHaveClass('hover:text-learn-incorrect-text');
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.correct' })
    ).toHaveClass('hover:text-learn-correct-text');
  });

  it('rates with the SM-2 quality in advanced mode', async () => {
    const props = renderRating({ isAdvancedMode: true });

    expect(
      screen.getByRole('group', { name: 'ai.artifacts.flashcards.rateCard' })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.quality.easy',
      })
    );

    expect(props.onRateAdvanced).toHaveBeenCalledWith(SM2_QUALITY.EASY);
    expect(props.onCorrect).not.toHaveBeenCalled();
  });

  it('keeps the simple buttons when advanced mode is read-only', () => {
    renderRating({ isAdvancedMode: true, readOnly: true });

    expect(
      screen.queryByRole('group', { name: 'ai.artifacts.flashcards.rateCard' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.correct' })
    ).toBeInTheDocument();
  });

  it('hides the interval captions while every rating predicts one day', () => {
    renderRating({ isAdvancedMode: true });

    expect(
      screen.getByRole('button', { name: /quality\.good/ })
    ).not.toHaveTextContent('1d');
  });
});
