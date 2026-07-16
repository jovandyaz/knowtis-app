import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BarList } from '../BarList';

describe('BarList', () => {
  it('renders one row per item with label and display value', () => {
    render(
      <BarList
        ariaLabel="Spend by model"
        items={[
          {
            label: 'claude-sonnet-5',
            value: 0.12,
            displayValue: '$0.12 · 80%',
          },
          {
            label: 'claude-haiku-4-5',
            value: 0.03,
            displayValue: '$0.03 · 20%',
          },
        ]}
      />
    );
    const list = screen.getByRole('list', { name: 'Spend by model' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('claude-sonnet-5')).toBeInTheDocument();
    expect(within(rows[0]).getByText('$0.12 · 80%')).toBeInTheDocument();
  });

  it('scales bar widths relative to the max value', () => {
    render(
      <BarList
        ariaLabel="Spend by model"
        items={[
          { label: 'a', value: 10, displayValue: '10' },
          { label: 'b', value: 5, displayValue: '5' },
        ]}
      />
    );
    const bars = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('[data-bar]'));
    expect(bars[0]).toHaveStyle({ width: '100%' });
    expect(bars[1]).toHaveStyle({ width: '50%' });
  });
});
