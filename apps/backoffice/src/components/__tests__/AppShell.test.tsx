import { AppShell } from '@/components/AppShell';
import { ADMIN_SECTIONS } from '@/config/admin-sections';
import { renderWithRouter } from '@/test/router';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const USER_EMAIL = 'ada@knowtis.app';
const LINKED_PATHS = ADMIN_SECTIONS.map((section) => section.to);

vi.mock('@/auth/setup', () => ({
  performLogout: vi.fn(),
}));

vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => ({ id: 'admin-1', email: USER_EMAIL, role: 'admin' }),
}));

describe('AppShell', () => {
  it('renders the nav, the account block and its children', async () => {
    await renderWithRouter(
      () => (
        <AppShell>
          <p>Page content</p>
        </AppShell>
      ),
      LINKED_PATHS
    );

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText(USER_EMAIL)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign out' })
    ).toBeInTheDocument();
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });
});
