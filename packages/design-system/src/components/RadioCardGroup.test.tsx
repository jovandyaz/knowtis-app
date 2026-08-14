import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RadioCardGroup } from './RadioCardGroup';

const OPTIONS = [
  { value: 'restricted', title: 'Private', description: 'Only you' },
  { value: 'link', title: 'Anyone with link', description: 'Anyone can open' },
] as const;

function renderGroup(
  overrides: Partial<{ value: 'restricted' | 'link' }> = {}
) {
  const onValueChange = vi.fn();
  render(
    <RadioCardGroup
      aria-label="General access"
      options={OPTIONS}
      value={overrides.value ?? 'restricted'}
      onValueChange={onValueChange}
    />
  );
  return { onValueChange };
}

describe('RadioCardGroup', () => {
  it('exposes the group and the selected option to assistive tech', () => {
    renderGroup({ value: 'link' });

    expect(
      screen.getByRole('radiogroup', { name: 'General access' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /Anyone with link/ })
    ).toBeChecked();
    expect(screen.getByRole('radio', { name: /Private/ })).not.toBeChecked();
  });

  it('keeps the group to a single tab stop', () => {
    renderGroup({ value: 'restricted' });

    expect(screen.getByRole('radiogroup')).toHaveAttribute('tabindex', '0');
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('tabindex', '-1');
    }
  });

  it('reports the newly chosen option', () => {
    const { onValueChange } = renderGroup({ value: 'restricted' });

    fireEvent.click(screen.getByRole('radio', { name: /Anyone with link/ }));

    expect(onValueChange).toHaveBeenCalledWith('link');
  });

  it('never reports a deselection when the active option is clicked again', () => {
    const { onValueChange } = renderGroup({ value: 'restricted' });

    fireEvent.click(screen.getByRole('radio', { name: /Private/ }));

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('disables every option as one unit', () => {
    render(
      <RadioCardGroup
        aria-label="General access"
        options={OPTIONS}
        value="restricted"
        onValueChange={vi.fn()}
        disabled
      />
    );

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
  });
});
