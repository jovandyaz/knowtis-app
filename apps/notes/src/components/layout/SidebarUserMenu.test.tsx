import { useNavigate } from '@tanstack/react-router';

import i18n from '@/lib/i18n';
import { useSettingsStore } from '@/stores/settings.store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarUserMenu } from './SidebarUserMenu';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: vi.fn(() => vi.fn()),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useLogout: () => ({ mutate: vi.fn() }),
}));

beforeEach(async () => {
  await i18n.changeLanguage('en');
  useSettingsStore.setState({ isOpen: false });
});

describe('SidebarUserMenu', () => {
  it('names the account once and keeps its trigger focusable and touch-sized', async () => {
    render(<SidebarUserMenu username="Ada Lovelace" />);
    const trigger = screen.getByRole('button', {
      name: 'Account: Ada Lovelace',
    });
    expect(trigger).toHaveClass('min-h-11', 'focus-visible:ring-2');
    expect(trigger.parentElement).toHaveClass(
      'shrink-0',
      'p-3',
      'border-t',
      'border-border'
    );
    expect(screen.getByText('AL')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('AL')).toHaveClass('h-8', 'w-8');
    expect(screen.getByText('Ada Lovelace')).toHaveClass('truncate', 'min-w-0');
    await userEvent.tab();
    expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(useSettingsStore.getState().isOpen).toBe(true);
  });

  it('localizes the contextual account name in Spanish', async () => {
    await i18n.changeLanguage('es');
    render(<SidebarUserMenu username="Ada" />);
    expect(
      screen.getByRole('button', { name: 'Cuenta: Ada' })
    ).toBeInTheDocument();
  });

  it('preserves the guest sign-in action', async () => {
    const navigate = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    render(<SidebarUserMenu username="" isAnonymous />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Account: Guest' })
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign in' }));
    expect(navigate).toHaveBeenCalledWith({
      to: '/login',
      search: { redirect: undefined },
    });
  });
});
