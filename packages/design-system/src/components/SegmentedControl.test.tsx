import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedControl } from './SegmentedControl';

const items = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
];

describe('SegmentedControl', () => {
  it('renders a tablist with the active tab selected', () => {
    render(
      <SegmentedControl
        items={items}
        value="a"
        onValueChange={vi.fn()}
        idBase="t"
        ariaLabel="modes"
      />
    );
    expect(screen.getByRole('tablist', { name: 'modes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('wires tab ids and aria-controls from idBase', () => {
    render(
      <SegmentedControl
        items={items}
        value="a"
        onValueChange={vi.fn()}
        idBase="dock"
      />
    );
    const tab = screen.getByRole('tab', { name: 'A' });
    expect(tab).toHaveAttribute('id', 'dock-tab-a');
    expect(tab).toHaveAttribute('aria-controls', 'dock-panel-a');
  });

  it('uses roving tabindex (active=0, others=-1)', () => {
    render(
      <SegmentedControl
        items={items}
        value="a"
        onValueChange={vi.fn()}
        idBase="t"
      />
    );
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute(
      'tabindex',
      '0'
    );
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  it('selects on click', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl
        items={items}
        value="a"
        onValueChange={onValueChange}
        idBase="t"
      />
    );
    await user.click(screen.getByRole('tab', { name: 'B' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('moves selection with ArrowRight / Home / End', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl
        items={items}
        value="a"
        onValueChange={onValueChange}
        idBase="t"
      />
    );
    screen.getByRole('tab', { name: 'A' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenLastCalledWith('b');
    await user.keyboard('{Home}');
    expect(onValueChange).toHaveBeenLastCalledWith('a');
    await user.keyboard('{End}');
    expect(onValueChange).toHaveBeenLastCalledWith('b');
  });
});
