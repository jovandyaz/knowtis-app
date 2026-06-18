import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ModelSelect } from './ModelSelect';

const models = [
  {
    id: 'a:fast',
    label: 'Fast One',
    descriptionKey: 'd1',
    tier: 'fast',
    contextWindow: 200000,
    costClass: 1,
    isDefault: false,
  },
  {
    id: 'a:bal',
    label: 'Balanced One',
    descriptionKey: 'd2',
    tier: 'balanced',
    contextWindow: 1000000,
    costClass: 2,
    isDefault: true,
  },
] as const;

describe('ModelSelect', () => {
  it('renders tier groups and emits the selected id', async () => {
    const onSelect = vi.fn();
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={onSelect}
        renderDescription={(m) => m.descriptionKey}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByText('Balanced One'));
    expect(onSelect).toHaveBeenCalledWith('a:bal');
  });

  it('shows one cost indicator per tier header derived from its costliest model', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        tierLabel={(tier) => tier.toUpperCase()}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('$')).toBeTruthy();
    expect(screen.getByText('$$')).toBeTruthy();
    expect(screen.queryAllByText('$$$')).toHaveLength(0);
  });

  it('renders the footer inside the popover when provided', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        footer="Account default: Balanced One"
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Account default: Balanced One')).toBeTruthy();
  });
});
