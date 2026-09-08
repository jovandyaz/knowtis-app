import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';

import { FlashcardNav } from './FlashcardNav';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));

function renderNav(
  overrides: Partial<Parameters<typeof FlashcardNav>[0]> = {}
) {
  const props = {
    wrongCount: 2,
    correctCount: 5,
    canGoPrev: false,
    onNavigatePrev: vi.fn(),
    onNavigateNext: vi.fn(),
    ...overrides,
  };
  render(
    <TooltipProvider>
      <FlashcardNav {...props} />
    </TooltipProvider>
  );
  return props;
}

describe('FlashcardNav', () => {
  it('names each counter, so a screen reader hears more than a bare number', () => {
    renderNav();

    expect(
      screen.getByText('ai.artifacts.flashcards.wrong').parentElement
    ).toHaveTextContent('ai.artifacts.flashcards.wrong2');
    expect(
      screen.getByText('ai.artifacts.flashcards.correct').parentElement
    ).toHaveTextContent('ai.artifacts.flashcards.correct5');
  });

  it('keeps the counter labels out of sight', () => {
    renderNav();

    expect(screen.getByText('ai.artifacts.flashcards.wrong')).toHaveClass(
      'sr-only'
    );
  });

  it('locks the previous arrow on the first card', () => {
    renderNav();

    expect(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.prev' })
    ).toBeDisabled();
  });

  it('walks the deck with the arrows', async () => {
    const props = renderNav({ canGoPrev: true });

    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.prev' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.next' })
    );

    expect(props.onNavigatePrev).toHaveBeenCalledTimes(1);
    expect(props.onNavigateNext).toHaveBeenCalledTimes(1);
  });

  it('gives both arrows a 44px touch target', () => {
    renderNav({ canGoPrev: true });

    expect(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.prev' })
    ).toHaveClass('h-11', 'w-11');
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.next' })
    ).toHaveClass('h-11', 'w-11');
  });
});
