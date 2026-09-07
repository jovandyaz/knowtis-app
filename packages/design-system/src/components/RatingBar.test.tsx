import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SM2_QUALITY } from '@knowtis/shared-types';

import { RatingBar } from './RatingBar';

const LABELS = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };
const days = (n: number) => `${n}d`;

describe('RatingBar', () => {
  it('rates with the SM-2 quality of the pressed button', () => {
    const onRate = vi.fn();
    render(
      <RatingBar
        label="Rate this card"
        intervals={{ again: 1, hard: 1, good: 6, easy: 15 }}
        labels={LABELS}
        formatInterval={days}
        onRate={onRate}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Good, 6d' }));
    expect(onRate).toHaveBeenCalledWith(SM2_QUALITY.GOOD);
    fireEvent.click(screen.getByRole('button', { name: 'Again, 1d' }));
    expect(onRate).toHaveBeenLastCalledWith(SM2_QUALITY.AGAIN);
  });

  it('hides the interval captions when every prediction is the same', () => {
    render(
      <RatingBar
        label="Rate this card"
        intervals={{ again: 1, hard: 1, good: 1, easy: 1 }}
        labels={LABELS}
        formatInterval={days}
        onRate={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument();
    expect(screen.queryByText('1d')).toBeNull();
  });

  it('shows key hints and disables every button on demand', () => {
    render(
      <RatingBar
        label="Rate this card"
        intervals={{ again: 1, hard: 1, good: 6, easy: 15 }}
        labels={LABELS}
        formatInterval={days}
        onRate={vi.fn()}
        showKeys
        disabled
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(4);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('exposes an accessible name on the root group', () => {
    render(
      <RatingBar
        label="Rate this card"
        intervals={{ again: 1, hard: 1, good: 6, easy: 15 }}
        labels={LABELS}
        formatInterval={days}
        onRate={vi.fn()}
      />
    );
    expect(
      screen.getByRole('group', { name: 'Rate this card' })
    ).toBeInTheDocument();
  });

  it('forwards rest props like id and data attributes to the root', () => {
    render(
      <RatingBar
        label="Rate this card"
        intervals={{ again: 1, hard: 1, good: 6, easy: 15 }}
        labels={LABELS}
        formatInterval={days}
        onRate={vi.fn()}
        id="rating-bar"
        data-testid="rating-bar-root"
      />
    );
    const root = screen.getByTestId('rating-bar-root');
    expect(root).toHaveAttribute('id', 'rating-bar');
  });
});
