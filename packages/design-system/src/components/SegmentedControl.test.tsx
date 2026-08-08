import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: 'fast', label: 'Fast' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'powerful', label: 'Deep' },
] as const;

describe('SegmentedControl', () => {
  it('renders every option and marks the active one', () => {
    render(
      <SegmentedControl
        aria-label="Style"
        options={OPTIONS}
        value="balanced"
        onValueChange={vi.fn()}
      />
    );
    expect(screen.getByRole('radio', { name: 'Balanced' })).toHaveAttribute(
      'data-state',
      'on'
    );
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('fires onValueChange with the clicked value', () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Style"
        options={OPTIONS}
        value="balanced"
        onValueChange={onValueChange}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Deep' }));
    expect(onValueChange).toHaveBeenCalledWith('powerful');
  });

  it('does not fire when the active segment is clicked again (no deselect)', () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Style"
        options={OPTIONS}
        value="balanced"
        onValueChange={onValueChange}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Balanced' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('renders no active segment when value is null', () => {
    render(
      <SegmentedControl
        aria-label="Style"
        options={OPTIONS}
        value={null}
        onValueChange={vi.fn()}
      />
    );
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('data-state', 'off');
    }
  });

  it('disables every segment and ignores clicks when disabled', () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Style"
        options={OPTIONS}
        value="balanced"
        onValueChange={onValueChange}
        disabled
      />
    );
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Deep' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
