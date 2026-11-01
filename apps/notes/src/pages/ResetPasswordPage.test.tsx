import type { ReactNode } from 'react';

import i18n from '@/lib/i18n';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { createAuthApiMock, createAuthWrapper } from '../test/auth-harness';
import { ResetPasswordPage } from './ResetPasswordPage';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useSearch: () => ({ token: 'reset-token' }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PASSWORD = 'Str0ng!pass';
const SUCCESS_TITLE = 'Password reset successful';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function submitNewPassword(api = createAuthApiMock()) {
  render(<ResetPasswordPage />, { wrapper: createAuthWrapper(api) });
  const liveRegion = screen.getByRole('status');

  await userEvent.type(screen.getByLabelText('New Password'), PASSWORD);
  await userEvent.type(screen.getByLabelText('Confirm Password'), PASSWORD);
  await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));

  return { api, liveRegion };
}

describe('ResetPasswordPage', () => {
  it('announces the new password in the region that held the form heading, without a toast', async () => {
    const { api, liveRegion } = await submitNewPassword();

    expect(await screen.findByText(SUCCESS_TITLE)).toBeInTheDocument();
    expect(api.resetPassword).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent(SUCCESS_TITLE);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('keeps the form and warns with a toast when the request is throttled', async () => {
    await submitNewPassword(
      createAuthApiMock({
        resetPassword: vi
          .fn()
          .mockRejectedValue(new ApiClientError('Too many requests', 429)),
      })
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(SUCCESS_TITLE)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reset password' })
    ).toBeEnabled();
  });
});
