import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AiConfigEntry } from '@knowtis/data-access-admin';

import { ConfigSourceCell } from '../ConfigSourceCell';

function entryWith(source: AiConfigEntry['source']): AiConfigEntry {
  return {
    key: 'ai_default_model',
    value: 'anthropic:claude-sonnet-5',
    kind: 'model',
    source,
    storedValue: null,
    description: null,
    updatedAt: null,
  };
}

function renderCell(source: AiConfigEntry['source'], pinnable = false) {
  render(
    <ConfigSourceCell
      entry={entryWith(source)}
      label="Default model"
      disabled={false}
      onReset={vi.fn()}
      pinnable={pinnable}
    />
  );
}

describe('ConfigSourceCell', () => {
  it('shows the wire source and Reset to default when not pinnable', () => {
    renderCell('custom');

    expect(screen.getByText('custom')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reset to default: Default model' })
    ).toHaveTextContent('Reset to default');
  });

  it('shows default and no action for a non-pinnable default', () => {
    renderCell('default');

    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows pinned and Release pin when pinnable', () => {
    renderCell('custom', true);

    expect(screen.getByText('pinned')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Release pin: Default model' })
    ).toHaveTextContent('Release pin');
  });

  it('shows auto and no action for a pinnable default', () => {
    renderCell('default', true);

    expect(screen.getByText('auto')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps stale as stale when pinnable', () => {
    renderCell('stale', true);

    expect(screen.getByText('stale')).toBeInTheDocument();
  });
});
