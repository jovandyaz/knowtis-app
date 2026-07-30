import { AppShellAccount } from '@/components/AppShellAccount';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_EMAIL = 'ada@knowtis.app';
const performLogoutMock = vi.fn();

vi.mock('@/auth/setup', () => ({
  performLogout: () => performLogoutMock(),
}));

vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => ({ id: 'admin-1', email: USER_EMAIL, role: 'admin' }),
}));

describe('AppShellAccount', () => {
  beforeEach(() => {
    performLogoutMock.mockReset();
  });

  it('renders the signed-in email', () => {
    render(<AppShellAccount />);

    expect(screen.getByText(USER_EMAIL)).toBeInTheDocument();
  });

  it('logs out once when sign out is chosen', async () => {
    render(<AppShellAccount />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(performLogoutMock).toHaveBeenCalledTimes(1);
  });
});
