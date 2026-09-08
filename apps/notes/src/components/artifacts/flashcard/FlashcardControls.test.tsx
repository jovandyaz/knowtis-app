import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SM2_QUALITY } from '@knowtis/shared-types';

import { FlashcardControls } from './FlashcardControls';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));

function renderControls(
  overrides: Partial<Parameters<typeof FlashcardControls>[0]> = {}
) {
  const props = {
    isAdvancedMode: false,
    isFlipped: true,
    readOnly: false,
    onWrong: vi.fn(),
    onCorrect: vi.fn(),
    onNavigatePrev: vi.fn(),
    onNavigateNext: vi.fn(),
    onRateAdvanced: vi.fn(),
    wrongCount: 0,
    correctCount: 0,
    disabled: false,
    canGoPrev: false,
    ...overrides,
  };
  render(<FlashcardControls {...props} />);
  return props;
}

describe('FlashcardControls', () => {
  it('rates correct and wrong in simple mode', async () => {
    const props = renderControls();

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

  it('rates with the SM-2 quality in advanced mode', async () => {
    const props = renderControls({ isAdvancedMode: true });

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
    renderControls({ isAdvancedMode: true, readOnly: true });

    expect(
      screen.queryByRole('group', { name: 'ai.artifacts.flashcards.rateCard' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.correct' })
    ).toBeInTheDocument();
  });

  it('hides the interval captions while every rating predicts one day', () => {
    renderControls({ isAdvancedMode: true });

    expect(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.quality.good',
      })
    ).not.toHaveTextContent('1d');
  });
});
