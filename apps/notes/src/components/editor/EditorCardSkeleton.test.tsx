import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EditorCardSkeleton } from './EditorCardSkeleton';

describe('EditorCardSkeleton', () => {
  it('keeps the loading card on the opaque editorial surface', () => {
    render(<EditorCardSkeleton label="Loading note" />);

    const card = screen.getByRole('status', {
      name: 'Loading note',
    }).parentElement;
    expect(card).toHaveClass(
      'rounded-lg',
      'border',
      'border-border',
      'bg-card',
      'focus-within:border-primary'
    );
    expect(card).not.toHaveClass(
      'bg-card/50',
      'backdrop-blur-sm',
      'focus-within:shadow-lg',
      'focus-within:shadow-primary/5'
    );
  });
});
