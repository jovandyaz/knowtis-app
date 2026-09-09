import { createRef, type ComponentProps } from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SM2_QUALITY } from '@knowtis/shared-types';

import { RATING_ORDER, type RatingKey } from '../constants/rating';
import { RatingBar } from './RatingBar';

const LABELS = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };
const days = (n: number) => `${n}d`;
const INTERVALS = { again: 1, hard: 1, good: 6, easy: 15 };
const CAPTION_BY_KEY: Record<RatingKey, string> = {
  again: '1d',
  hard: '1d',
  good: '6d',
  easy: '15d',
};
const QUALITY_BY_KEY: Record<
  RatingKey,
  (typeof SM2_QUALITY)[keyof typeof SM2_QUALITY]
> = {
  again: SM2_QUALITY.AGAIN,
  hard: SM2_QUALITY.HARD,
  good: SM2_QUALITY.GOOD,
  easy: SM2_QUALITY.EASY,
};

function renderBar(props: Partial<ComponentProps<typeof RatingBar>> = {}) {
  const onRate = vi.fn();
  render(
    <RatingBar
      label="Rate this card"
      intervals={INTERVALS}
      labels={LABELS}
      formatInterval={days}
      onRate={onRate}
      {...props}
    />
  );
  return onRate;
}

describe('RatingBar', () => {
  it.each(RATING_ORDER)('rates "%s" with its SM-2 quality', (key) => {
    const onRate = renderBar();
    const button = screen.getByRole('button', {
      name: `${LABELS[key]}, ${CAPTION_BY_KEY[key]}`,
    });
    expect(within(button).getByText(CAPTION_BY_KEY[key])).toBeInTheDocument();
    fireEvent.click(button);
    expect(onRate).toHaveBeenCalledWith(QUALITY_BY_KEY[key]);
  });

  it('hides the interval captions when every prediction is the same', () => {
    renderBar({ intervals: { again: 1, hard: 1, good: 1, easy: 1 } });
    expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument();
    expect(screen.queryByText('1d')).toBeNull();
  });

  it('hides distinct interval captions when the consumer opts out', () => {
    renderBar({ showIntervals: false });
    expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument();
    expect(screen.queryByText('6d')).toBeNull();
    expect(screen.queryByText('15d')).toBeNull();
  });

  it('shows key hints and disables every button on demand', () => {
    renderBar({ showKeys: true, disabled: true });
    expect(
      screen.getByRole('button', { name: 'Good, 6d' })
    ).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    for (const hint of ['1', '2', '3', '4']) {
      expect(screen.getByText(hint)).toBeInTheDocument();
    }
  });

  it('announces the shortcut of each button only while the hints show', () => {
    renderBar({ showKeys: true });
    expect(screen.getByRole('button', { name: 'Good, 6d' })).toHaveAttribute(
      'aria-keyshortcuts',
      '3'
    );
  });

  it('omits the shortcut when the consumer does not wire the keys', () => {
    renderBar();
    expect(
      screen.getByRole('button', { name: 'Good, 6d' })
    ).not.toHaveAttribute('aria-keyshortcuts');
  });

  it('paints the tone buttons with the AA-contrast text tokens', () => {
    renderBar();
    expect(screen.getByRole('button', { name: 'Again, 1d' })).toHaveClass(
      'text-learn-incorrect-text'
    );
    expect(screen.getByRole('button', { name: 'Good, 6d' })).toHaveClass(
      'text-learn-correct-text'
    );
  });

  it('floors the tap target at 44px only where the pointer is coarse', () => {
    renderBar();
    const button = screen.getByRole('button', { name: 'Good, 6d' });
    expect(button).toHaveClass(
      'pointer-coarse:min-h-11',
      'pointer-coarse:min-w-11'
    );
    expect(button.className.split(' ')).not.toContain('min-h-11');
  });

  it('keeps the transition disabled under reduced motion', () => {
    renderBar();
    expect(
      screen.getByRole('button', { name: 'Good, 6d' }).className
    ).toContain('motion-reduce:transition-none');
  });

  it('exposes an accessible name on the root group', () => {
    renderBar();
    expect(
      screen.getByRole('group', { name: 'Rate this card' })
    ).toBeInTheDocument();
  });

  it('forwards a ref to the root group', () => {
    const ref = createRef<HTMLDivElement>();
    renderBar({ ref });
    expect(ref.current).toBe(
      screen.getByRole('group', { name: 'Rate this card' })
    );
  });

  it('forwards rest props like id and data attributes to the root', () => {
    render(
      <RatingBar
        label="Rate this card"
        intervals={INTERVALS}
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
