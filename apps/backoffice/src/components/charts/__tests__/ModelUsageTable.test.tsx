import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModelUsageTable } from '../ModelUsageTable';

function rowTexts() {
  const body = within(screen.getByRole('table', { name: 'By model' }))
    .getAllByRole('rowgroup')
    .at(-1);
  return within(body as HTMLElement)
    .getAllByRole('row')
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    );
}

describe('ModelUsageTable', () => {
  it('ranks models by cost and reports volume, spend, unit price and share', () => {
    render(
      <ModelUsageTable
        byModel={{
          'claude-haiku-4-5': { requests: 15, tokens: 1000, costUsd: 0.03 },
          'claude-sonnet-5': { requests: 25, tokens: 3000, costUsd: 0.17 },
        }}
      />
    );

    expect(rowTexts()).toEqual([
      ['claude-sonnet-5', '25', '3,000', '$0.1700', '$0.0068', '85%'],
      ['claude-haiku-4-5', '15', '1,000', '$0.0300', '$0.0020', '15%'],
    ]);
  });

  it('shows a dash instead of Infinity when a model recorded cost but no requests', () => {
    render(
      <ModelUsageTable
        byModel={{
          'claude-sonnet-5': { requests: 0, tokens: 0, costUsd: 0.02 },
        }}
      />
    );

    expect(rowTexts()).toEqual([
      ['claude-sonnet-5', '0', '0', '$0.0200', '—', '100%'],
    ]);
  });

  it('shows a zero share instead of NaN when nothing was spent', () => {
    render(
      <ModelUsageTable
        byModel={{
          'claude-sonnet-5': { requests: 4, tokens: 120, costUsd: 0 },
        }}
      />
    );

    expect(rowTexts()).toEqual([
      ['claude-sonnet-5', '4', '120', '$0.0000', '$0.0000', '0%'],
    ]);
  });
});
