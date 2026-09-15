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
    canGoPrev: false,
    canGoNext: true,
    canSkip: true,
    onNavigatePrev: vi.fn(),
    onNavigateNext: vi.fn(),
    onSkip: vi.fn(),
    ...overrides,
  };
  render(
    <TooltipProvider>
      <FlashcardNav {...props} />
    </TooltipProvider>
  );
  return props;
}

const PREV = { name: 'ai.artifacts.flashcards.prev' };
const NEXT = { name: 'ai.artifacts.flashcards.next' };
const SKIP = { name: 'ai.artifacts.flashcards.skipCard' };

describe('FlashcardNav', () => {
  it('locks the previous arrow on the first card', () => {
    renderNav();

    expect(screen.getByRole('button', PREV)).toBeDisabled();
  });

  it('locks the next arrow on the last card instead of finishing the deck', () => {
    renderNav({ canGoNext: false });

    expect(screen.getByRole('button', NEXT)).toBeDisabled();
  });

  it('walks the deck with the arrows', async () => {
    const props = renderNav({ canGoPrev: true });

    await userEvent.click(screen.getByRole('button', PREV));
    await userEvent.click(screen.getByRole('button', NEXT));

    expect(props.onNavigatePrev).toHaveBeenCalledTimes(1);
    expect(props.onNavigateNext).toHaveBeenCalledTimes(1);
    expect(props.onSkip).not.toHaveBeenCalled();
  });

  it('skips the current card only through its own button', async () => {
    const props = renderNav();

    await userEvent.click(screen.getByRole('button', SKIP));

    expect(props.onSkip).toHaveBeenCalledTimes(1);
    expect(props.onNavigateNext).not.toHaveBeenCalled();
  });

  it('locks skipping on a card that is already recorded', () => {
    renderNav({ canSkip: false });

    expect(screen.getByRole('button', SKIP)).toBeDisabled();
  });

  it('gives every control a 48px touch target', () => {
    renderNav({ canGoPrev: true });

    expect(screen.getByRole('button', PREV)).toHaveClass('h-12', 'w-12');
    expect(screen.getByRole('button', NEXT)).toHaveClass('h-12', 'w-12');
    expect(screen.getByRole('button', SKIP)).toHaveClass('min-h-12');
  });
  it('lays out only previous, skip and next in three fixed columns', () => {
    renderNav();
    const buttons = screen.getAllByRole('button');
    expect(
      buttons.map(
        (button) => button.getAttribute('aria-label') ?? button.textContent
      )
    ).toEqual([
      'ai.artifacts.flashcards.prev',
      'ai.artifacts.flashcards.skipCard',
      'ai.artifacts.flashcards.next',
    ]);
    expect(buttons[0].parentElement).toHaveClass(
      'grid',
      'grid-cols-[auto_1fr_auto]'
    );
    expect(
      screen.queryByText('ai.artifacts.flashcards.wrong')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('ai.artifacts.flashcards.correct')
    ).not.toBeInTheDocument();
  });
});
