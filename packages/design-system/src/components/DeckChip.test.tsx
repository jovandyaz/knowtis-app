import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DECK_CHIP_TONES, type DeckChipTone } from '../constants/deck-chip';
import { DeckChip } from './DeckChip';

const DOT_CLASS_BY_TONE: Record<DeckChipTone, string> = {
  neutral: 'bg-(--muted-foreground)',
  projects: 'bg-bucket-projects',
  areas: 'bg-bucket-areas',
  resources: 'bg-bucket-resources',
  archive: 'border-bucket-archive',
};

describe('DeckChip', () => {
  it('shows the deck title and the new badge', () => {
    render(
      <DeckChip title="The 80/20 rule" tone="projects" isNew newLabel="New" />
    );
    expect(screen.getByText('The 80/20 rule')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('keeps the new badge inside phrasing content', () => {
    render(<DeckChip title="The 80/20 rule" isNew newLabel="New" />);
    expect(screen.getByText('New').tagName).toBe('SPAN');
  });

  it('omits the badge for a seen card and falls back to the neutral tone', () => {
    const { container } = render(<DeckChip title="Deck" newLabel="New" />);
    expect(screen.queryByText('New')).toBeNull();
    expect(container.querySelector('[data-tone="neutral"]')).not.toBeNull();
  });

  it.each(DECK_CHIP_TONES)('paints the %s dot with its own tone', (tone) => {
    const { container } = render(
      <DeckChip title="Deck" newLabel="New" tone={tone} />
    );
    expect(container.querySelector(`[data-tone="${tone}"]`)).toHaveClass(
      DOT_CLASS_BY_TONE[tone]
    );
  });

  it('exposes the title as a native tooltip on the truncated span', () => {
    render(<DeckChip title="The 80/20 rule" newLabel="New" />);
    expect(screen.getByText('The 80/20 rule')).toHaveAttribute(
      'title',
      'The 80/20 rule'
    );
  });

  it('forwards a ref to the root', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<DeckChip ref={ref} title="Deck" newLabel="New" />);
    expect(ref.current).toBe(screen.getByText('Deck').parentElement);
  });

  it('forwards rest props like id and data-testid to the root', () => {
    render(
      <DeckChip
        title="Deck"
        newLabel="New"
        id="deck-chip"
        data-testid="deck-chip-root"
      />
    );
    const root = screen.getByTestId('deck-chip-root');
    expect(root).toHaveAttribute('id', 'deck-chip');
  });
});
