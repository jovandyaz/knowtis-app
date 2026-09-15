import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StudyKeyHints } from './StudyKeyHints';

describe('StudyKeyHints', () => {
  it('renders the keycaps and labels for two hints', () => {
    render(
      <StudyKeyHints
        hints={[
          { keys: ['Space', 'Enter'], label: 'Flip card' },
          { keys: ['←', '→'], label: 'Browse cards' },
        ]}
      />
    );

    const hints = within(screen.getByRole('list'));
    expect(screen.getByRole('list')).toHaveAttribute('role', 'list');
    expect(hints.getAllByRole('listitem')).toHaveLength(2);
    expect(hints.getByText('Flip card')).toBeInTheDocument();
    expect(hints.getByText('Space', { selector: 'kbd' })).toBeInTheDocument();
    expect(hints.getByText('Enter', { selector: 'kbd' })).toBeInTheDocument();
    expect(hints.getByText('Browse cards')).toBeInTheDocument();
    expect(hints.getByText('←', { selector: 'kbd' })).toBeInTheDocument();
    expect(hints.getByText('→', { selector: 'kbd' })).toBeInTheDocument();
  });
});
