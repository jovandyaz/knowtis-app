import i18n from '@/lib/i18n';
import { useVerifyEmailStore } from '@/stores/verify-email.store';
import {
  AuthErrorCodes,
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_RESEND_COOLDOWN_MS,
} from '@jovandyaz/auth';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import {
  createAuthApiMock,
  createAuthWrapper,
  HARNESS_PROFILE,
} from '../../test/auth-harness';
import { VerifyEmailDialog } from './VerifyEmailDialog';

const CODE = '123456';
const CODE_LABEL = 'Verification code';
const VERIFY_BUTTON = 'Verify email';
const RESEND_BUTTON = 'Resend verification email';

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (message: string) => toastSuccess(message),
    error: vi.fn(),
  },
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  vi.clearAllMocks();
  useVerifyEmailStore.setState({ isOpen: false });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderDialog(api = createAuthApiMock()) {
  render(<VerifyEmailDialog />, {
    wrapper: createAuthWrapper(api, { user: HARNESS_PROFILE }),
  });
  return { api };
}

function openDialog() {
  act(() => {
    useVerifyEmailStore.getState().open();
  });
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('VerifyEmailDialog', () => {
  it('names the address and how many digits the code has', () => {
    renderDialog();
    openDialog();

    expect(
      screen.getByText(
        new RegExp(`${VERIFICATION_CODE_LENGTH}-digit.*${HARNESS_PROFILE.email}`)
      )
    ).toBeInTheDocument();
  });

  it('stays out of the way until something opens it', () => {
    renderDialog();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the address the code goes to', () => {
    renderDialog();
    openDialog();

    expect(screen.getByRole('dialog')).toHaveTextContent(HARNESS_PROFILE.email);
  });

  it('lands focus on the code field so the user can type straight away', () => {
    renderDialog();
    openDialog();

    expect(document.activeElement).toBe(screen.getByLabelText(CODE_LABEL));
  });

  it('offers a code immediately, because none was just sent', () => {
    renderDialog();
    openDialog();

    expect(screen.getByRole('button', { name: RESEND_BUTTON })).toBeEnabled();
  });

  it('holds the resend for the server cooldown once one has been sent', async () => {
    vi.useFakeTimers();
    const { api } = renderDialog();
    openDialog();

    fireEvent.click(screen.getByRole('button', { name: RESEND_BUTTON }));
    await flushPromises();

    expect(api.resendVerification).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Resend in 60s' })
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(VERIFICATION_RESEND_COOLDOWN_MS);
    });
    expect(screen.getByRole('button', { name: RESEND_BUTTON })).toBeEnabled();
  });

  it('arms the cooldown hold when the server says the last code is too recent', async () => {
    vi.useFakeTimers();
    const api = createAuthApiMock({
      resendVerification: vi
        .fn()
        .mockRejectedValue(
          new ApiClientError('Wait', 429, AuthErrorCodes.RESEND_COOLDOWN)
        ),
    });
    renderDialog(api);
    openDialog();

    fireEvent.click(screen.getByRole('button', { name: RESEND_BUTTON }));
    await flushPromises();

    expect(api.resendVerification).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Resend in 60s' })
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(VERIFICATION_RESEND_COOLDOWN_MS);
    });
    expect(screen.getByRole('button', { name: RESEND_BUTTON })).toBeEnabled();
  });

  it('stops offering a resend the endpoint throttle has locked out', async () => {
    vi.useFakeTimers();
    const api = createAuthApiMock({
      resendVerification: vi
        .fn()
        .mockRejectedValue(new ApiClientError('Too many requests', 429)),
    });
    renderDialog(api);
    openDialog();

    fireEvent.click(screen.getByRole('button', { name: RESEND_BUTTON }));
    await flushPromises();

    // No countdown: the throttle window is the server's, and it is not 60s.
    expect(screen.getByRole('button', { name: RESEND_BUTTON })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Resend in 60s' })
    ).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(VERIFICATION_RESEND_COOLDOWN_MS);
    });
    expect(screen.getByRole('button', { name: RESEND_BUTTON })).toBeDisabled();
  });

  it('says the wait is minutes, not a moment, once the throttle locks out', async () => {
    const api = createAuthApiMock({
      resendVerification: vi
        .fn()
        .mockRejectedValue(new ApiClientError('Too many requests', 429)),
    });
    renderDialog(api);
    openDialog();

    await userEvent.click(screen.getByRole('button', { name: RESEND_BUTTON }));

    expect(
      await screen.findByText(
        'Too many requests for a new code. Wait a few minutes before trying again.'
      )
    ).toBeInTheDocument();
  });

  it('leaves the resend free when it failed for a reason other than the cooldown', async () => {
    const api = createAuthApiMock({
      resendVerification: vi
        .fn()
        .mockRejectedValue(new ApiClientError('Boom', 500, 'INTERNAL')),
    });
    renderDialog(api);
    openDialog();

    await userEvent.click(screen.getByRole('button', { name: RESEND_BUTTON }));

    expect(
      await screen.findByRole('button', { name: RESEND_BUTTON })
    ).toBeEnabled();
  });

  it('verifies the code, confirms it and closes without leaving the page', async () => {
    const { api } = renderDialog();
    openDialog();

    await userEvent.type(screen.getByLabelText(CODE_LABEL), CODE);
    await userEvent.click(screen.getByRole('button', { name: VERIFY_BUTTON }));

    await waitFor(() =>
      expect(useVerifyEmailStore.getState().isOpen).toBe(false)
    );
    expect(api.verifyEmailCode).toHaveBeenCalledWith(CODE);
    expect(toastSuccess).toHaveBeenCalledWith('Email verified successfully!');
  });

  it('keeps the dialog open and says why when the code is wrong', async () => {
    const api = createAuthApiMock({
      verifyEmailCode: vi
        .fn()
        .mockRejectedValue(
          new ApiClientError('Invalid code', 400, 'INVALID_VERIFICATION_CODE')
        ),
    });
    renderDialog(api);
    openDialog();

    await userEvent.type(screen.getByLabelText(CODE_LABEL), CODE);
    await userEvent.click(screen.getByRole('button', { name: VERIFY_BUTTON }));

    expect(
      await screen.findByText(
        "That code isn't right. Check the email and try again."
      )
    ).toBeInTheDocument();
    expect(useVerifyEmailStore.getState().isOpen).toBe(true);
  });

  it('forgets a half-typed code between openings', async () => {
    renderDialog();
    openDialog();

    await userEvent.type(screen.getByLabelText(CODE_LABEL), '123');
    act(() => {
      useVerifyEmailStore.getState().close();
    });
    openDialog();

    expect(screen.getByLabelText(CODE_LABEL)).toHaveValue('');
  });
});
