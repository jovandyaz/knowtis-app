import type { ReactNode } from 'react';

import { AppShellNav } from '@/components/AppShellNav';
import { ADMIN_SECTIONS } from '@/config/admin-sections';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    onClick,
    className,
  }: {
    to: string;
    children: ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

describe('AppShellNav', () => {
  it('renders Dashboard plus every admin section', () => {
    render(<AppShellNav />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    for (const section of ADMIN_SECTIONS) {
      expect(
        screen.getByRole('link', { name: section.label })
      ).toBeInTheDocument();
    }
  });

  it('calls onNavigate when a destination is chosen', async () => {
    const onNavigate = vi.fn();
    render(<AppShellNav onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('link', { name: 'Users' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onNavigate is omitted', async () => {
    render(<AppShellNav />);
    await userEvent.click(screen.getByRole('link', { name: 'Users' }));
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
  });
});
