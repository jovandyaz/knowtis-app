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
});
