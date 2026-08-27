import i18n from '@/lib/i18n';
import {
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
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { createAuthApiMock, createAuthWrapper } from '../../test/auth-harness';
import { VerifyCodeStep } from './VerifyCodeStep';

const EMAIL = 'jane@knowtis.app';
const CODE = '123456';
const CODE_LABEL = 'Verification code';
const VERIFY_BUTTON = 'Verify email';
const RESEND_BUTTON = 'Resend verification email';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.useRealTimers();
});

function renderStep(api = createAuthApiMock()) {
  const onVerified = vi.fn();
  const onSkip = vi.fn();

  render(
    <VerifyCodeStep email={EMAIL} onVerified={onVerified} onSkip={onSkip} />,
    {
      wrapper: createAuthWrapper(api),
    }
  );

  return { api, onVerified, onSkip };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('VerifyCodeStep', () => {
  it('verifies the emailed code without leaving the screen', async () => {
    const { api, onVerified } = renderStep();

    await userEvent.type(screen.getByLabelText(CODE_LABEL), CODE);
    await userEvent.click(screen.getByRole('button', { name: VERIFY_BUTTON }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(api.verifyEmailCode).toHaveBeenCalledWith(CODE);
  });

  it('tells the user how many digits to look for', () => {
    renderStep();

    expect(
      screen.getByText(`${VERIFICATION_CODE_LENGTH}-digit`, { exact: false })
    ).toBeInTheDocument();
  });

  it('waits for the full six digits before it lets the code be submitted', async () => {
    renderStep();

    const submit = screen.getByRole('button', { name: VERIFY_BUTTON });
    await userEvent.type(screen.getByLabelText(CODE_LABEL), '123');
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(CODE_LABEL), '456');
    expect(submit).toBeEnabled();
  });

  it('says the code is wrong and leaves the user free to retry', async () => {
    const api = createAuthApiMock({
      verifyEmailCode: vi
        .fn()
        .mockRejectedValue(
          new ApiClientError('Invalid code', 400, 'INVALID_VERIFICATION_CODE')
        ),
    });
    const { onVerified } = renderStep(api);

    await userEvent.type(screen.getByLabelText(CODE_LABEL), CODE);
    await userEvent.click(screen.getByRole('button', { name: VERIFY_BUTTON }));

    expect(
      await screen.findByText(
        "That code isn't right. Check the email and try again."
      )
    ).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('sends the user to a new code once the tries are spent', async () => {
    const api = createAuthApiMock({
      verifyEmailCode: vi
        .fn()
        .mockRejectedValue(
          new ApiClientError(
            'Too many attempts',
            429,
            'TOO_MANY_VERIFICATION_ATTEMPTS'
          )
        ),
    });
    renderStep(api);

    await userEvent.type(screen.getByLabelText(CODE_LABEL), CODE);
    await userEvent.click(screen.getByRole('button', { name: VERIFY_BUTTON }));

    expect(
      await screen.findByText(
        /Too many wrong tries\. You can request a new code in \d+s\./
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "That code isn't right. Check the email and try again."
      )
    ).not.toBeInTheDocument();
  });

  it('clears the wrong-code message as soon as the user edits the code', async () => {
    const api = createAuthApiMock({
      verifyEmailCode: vi
        .fn()
        .mockRejectedValue(
          new ApiClientError('Invalid code', 400, 'INVALID_VERIFICATION_CODE')
        ),
    });
    renderStep(api);

    const input = screen.getByLabelText(CODE_LABEL);
    await userEvent.type(input, CODE);
    await userEvent.click(screen.getByRole('button', { name: VERIFY_BUTTON }));
    await screen.findByText(
      "That code isn't right. Check the email and try again."
    );

    await userEvent.type(input, '{backspace}');

    expect(
      screen.queryByText(
        "That code isn't right. Check the email and try again."
      )
    ).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('names the wait at the attempt cap, and only offers a new code once the cooldown ends', async () => {
    vi.useFakeTimers();
    const api = createAuthApiMock({
      verifyEmailCode: vi
        .fn()
        .mockRejectedValue(
          new ApiClientError(
            'Too many attempts',
            429,
            'TOO_MANY_VERIFICATION_ATTEMPTS'
          )
        ),
    });
    renderStep(api);

    fireEvent.change(screen.getByLabelText(CODE_LABEL), {
      target: { value: CODE },
    });
    fireEvent.click(screen.getByRole('button', { name: VERIFY_BUTTON }));
    await flushPromises();

    expect(
      screen.getByText(
        'Too many wrong tries. You can request a new code in 60s.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Resend in 60s' })
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(
      screen.getByText(
        'Too many wrong tries. You can request a new code in 30s.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Resend in 30s' })
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(VERIFICATION_RESEND_COOLDOWN_MS);
    });

    expect(
      screen.getByText('Too many wrong tries. Request a new code to continue.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: RESEND_BUTTON })).toBeEnabled();
  });

  it('keeps the attempt-cap message while the user edits the dead code', async () => {
    const api = createAuthApiMock({
      verifyEmailCode: vi
        .fn()
        .mockRejectedValue(
          new ApiClientError(
            'Too many attempts',
            429,
            'TOO_MANY_VERIFICATION_ATTEMPTS'
          )
        ),
    });
    renderStep(api);

    const input = screen.getByLabelText(CODE_LABEL);
    await userEvent.type(input, CODE);
    await userEvent.click(screen.getByRole('button', { name: VERIFY_BUTTON }));
    await screen.findByText(/Too many wrong tries/);

    await userEvent.type(input, '{backspace}');

    expect(screen.getByText(/Too many wrong tries/)).toBeInTheDocument();
  });

  it('holds resend for the server cooldown so the request never comes back 429', async () => {
    vi.useFakeTimers();
    const { api } = renderStep();

    expect(
      screen.getByRole('button', { name: 'Resend in 60s' })
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(
      screen.getByRole('button', { name: 'Resend in 30s' })
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const resend = screen.getByRole('button', { name: RESEND_BUTTON });
    expect(resend).toBeEnabled();

    fireEvent.click(resend);
    await flushPromises();

    expect(api.resendVerification).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Resend in 60s' })
    ).toBeDisabled();
  });

  it('lets the user into the app without verifying', async () => {
    const { api, onSkip } = renderStep();

    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(api.verifyEmailCode).not.toHaveBeenCalled();
  });
});
