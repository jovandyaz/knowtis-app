import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';

import { FlashcardHeader } from './FlashcardHeader';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));

function renderHeader(
  overrides: Partial<Parameters<typeof FlashcardHeader>[0]> = {}
) {
  render(
    <TooltipProvider>
      <FlashcardHeader
        current={2}
        total={10}
        reviewedCount={3}
        isAdvancedMode={false}
        onToggleAdvanced={vi.fn()}
        onRestart={vi.fn()}
        onShuffle={vi.fn()}
        {...overrides}
      />
    </TooltipProvider>
  );
}

describe('FlashcardHeader', () => {
  it('names the ring after what it measures, not after the card position', () => {
    renderHeader();

    const ring = screen.getByRole('progressbar');
    expect(ring).toHaveAccessibleName(
      'ai.artifacts.flashcards.reviewedOf {"reviewed":3,"total":10}'
    );
    expect(ring).toHaveAttribute('aria-valuenow', '3');
    expect(ring).toHaveAttribute('aria-valuemax', '10');
  });

  it('keeps the card position as the visible caption', () => {
    renderHeader();

    expect(
      screen.getByText(
        'ai.artifacts.flashcards.cardOf {"current":3,"total":10}'
      )
    ).toBeInTheDocument();
  });

  it('hides the session controls from a read-only viewer', () => {
    renderHeader({ readOnly: true });

    expect(
      screen.queryByRole('button', { name: 'ai.artifacts.flashcards.restart' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ai.artifacts.flashcards.shuffle' })
    ).not.toBeInTheDocument();
  });
});
