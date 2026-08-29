import type { ReactNode } from 'react';

import i18n from '@/lib/i18n';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { createAuthApiMock, createAuthWrapper } from '../test/auth-harness';
import { RegisterPage } from './RegisterPage';

const navigate = vi.fn();
const toastSuccess = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    className,
    children,
  }: {
    to: string;
    className?: string;
    children: ReactNode;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));

const EMAIL = 'jane@knowtis.app';
const PASSWORD = 'Str0ng!pass';
const CODE = '123456';
const CODE_LABEL = 'Verification code';
const APP_HOME = '/dashboard';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  vi.clearAllMocks();
});

function renderPage(api = createAuthApiMock()) {
  render(<RegisterPage />, { wrapper: createAuthWrapper(api) });
  return api;
}

async function submitRegistration() {
  await userEvent.type(screen.getByLabelText('Full Name'), 'Jane Doe');
  await userEvent.type(screen.getByLabelText('Email'), EMAIL);
  await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
  await userEvent.type(screen.getByLabelText('Confirm Password'), PASSWORD);
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('RegisterPage', () => {
  it('asks for the emailed code as soon as the account exists', async () => {
    renderPage();

    await submitRegistration();

    expect(await screen.findByLabelText(CODE_LABEL)).toBeInTheDocument();
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Verify email' })
    ).toBeInTheDocument();
  });

  it('takes the verified user into the app', async () => {
    const api = renderPage();

    await submitRegistration();
    await userEvent.type(await screen.findByLabelText(CODE_LABEL), CODE);
    await userEvent.click(screen.getByRole('button', { name: 'Verify email' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: APP_HOME })
    );
    expect(api.verifyEmailCode).toHaveBeenCalledWith(CODE);
    expect(toastSuccess).toHaveBeenCalledWith('Email verified successfully!');
  });

  it('lets an unverified user into the app when they skip', async () => {
    const api = renderPage();

    await submitRegistration();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Skip for now' })
    );

    expect(navigate).toHaveBeenCalledWith({ to: APP_HOME });
    expect(api.verifyEmailCode).not.toHaveBeenCalled();
  });

  it('points a taken address at the password reset that reclaims it', async () => {
    renderPage(
      createAuthApiMock({
        register: vi
          .fn()
          .mockRejectedValue(
            new ApiClientError(
              'Email already registered',
              409,
              'EMAIL_ALREADY_EXISTS'
            )
          ),
      })
    );

    await submitRegistration();

    const reclaim = await screen.findByRole('link', {
      name: 'Is this address yours? Reset the password to reclaim it.',
    });
    expect(reclaim).toHaveAttribute('href', '/forgot-password');
  });
});
