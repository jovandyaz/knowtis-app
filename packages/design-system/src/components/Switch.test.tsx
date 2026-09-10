import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from './Switch';

describe('Switch', () => {
  it('exposes switch semantics and the checked state', () => {
    render(
      <Switch checked onCheckedChange={vi.fn()} aria-label="notifications" />
    );
    const control = screen.getByRole('switch', { name: 'notifications' });
    expect(control).toBeChecked();
    expect(control).toHaveAttribute('data-state', 'checked');
  });

  it('reports the next value on click', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Switch
        checked={false}
        onCheckedChange={onCheckedChange}
        aria-label="notifications"
      />
    );

    await user.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('toggles from the keyboard', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Switch
        checked={false}
        onCheckedChange={onCheckedChange}
        aria-label="notifications"
      />
    );

    await user.tab();
    await user.keyboard(' ');
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('does not report changes while disabled', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Switch
        checked={false}
        onCheckedChange={onCheckedChange}
        disabled
        aria-label="notifications"
      />
    );

    await user.click(screen.getByRole('switch'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('renders the small size on request', () => {
    render(
      <Switch
        checked={false}
        onCheckedChange={vi.fn()}
        size="sm"
        aria-label="notifications"
      />
    );
    expect(screen.getByRole('switch')).toHaveClass('h-4', 'w-7');
  });

  it('serializes as a form field when checked', () => {
    const { container } = render(
      <form>
        <Switch
          checked
          onCheckedChange={vi.fn()}
          name="notifications"
          value="on"
          aria-label="notifications"
        />
      </form>
    );
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(new FormData(form as HTMLFormElement).get('notifications')).toBe(
      'on'
    );
  });

  it('omits the field entirely when unchecked', () => {
    const { container } = render(
      <form>
        <Switch
          checked={false}
          onCheckedChange={vi.fn()}
          name="notifications"
          value="on"
          aria-label="notifications"
        />
      </form>
    );
    const form = container.querySelector('form');
    expect(
      new FormData(form as HTMLFormElement).get('notifications')
    ).toBeNull();
  });
});
