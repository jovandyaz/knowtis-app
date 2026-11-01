import type { ReactNode } from 'react';

import i18n from '@/lib/i18n';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { createAuthApiMock, createAuthWrapper } from '../test/auth-harness';
import { ForgotPasswordPage } from './ForgotPasswordPage';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const EMAIL = 'jane@knowtis.app';
const SEND_BUTTON = 'Send reset link';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function requestReset(api = createAuthApiMock()) {
  render(<ForgotPasswordPage />, { wrapper: createAuthWrapper(api) });
  const liveRegion = screen.getByRole('status');

  await userEvent.type(screen.getByLabelText('Email'), EMAIL);
  await userEvent.click(screen.getByRole('button', { name: SEND_BUTTON }));

  return { api, liveRegion };
}

describe('ForgotPasswordPage', () => {
  it('announces the sent link in the region that held the form heading, without a toast', async () => {
    const { api, liveRegion } = await requestReset();

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(api.forgotPassword).toHaveBeenCalledWith(EMAIL);
    expect(screen.getByRole('status')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent(EMAIL);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('keeps the form and warns with a toast when the request is throttled', async () => {
    await requestReset(
      createAuthApiMock({
        forgotPassword: vi
          .fn()
          .mockRejectedValue(new ApiClientError('Too many requests', 429)),
      })
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: SEND_BUTTON })).toBeEnabled();
  });
});
