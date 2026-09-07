import type { FormEvent } from 'react';

import i18n from '@/lib/i18n';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { createAuthApiMock, createAuthWrapper } from '../../test/auth-harness';
import { useVerifyEmailCodeForm } from './useVerifyEmailCodeForm';

const CODE = '123456';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function submitEvent(): FormEvent<HTMLFormElement> {
  return {
    preventDefault: vi.fn(),
  } as unknown as FormEvent<HTMLFormElement>;
}

describe('useVerifyEmailCodeForm', () => {
  it('notifies only after a successful resend clears the stale code', async () => {
    const api = createAuthApiMock();
    const onCodeCleared = vi.fn();
    const { result } = renderHook(
      () =>
        useVerifyEmailCodeForm({
          onVerified: vi.fn(),
          onCodeCleared,
          startHeld: false,
        }),
      { wrapper: createAuthWrapper(api) }
    );

    expect(onCodeCleared).not.toHaveBeenCalled();
    act(() => result.current.onCodeChange(CODE));
    act(() => result.current.onResend());

    await waitFor(() => expect(result.current.code).toBe(''));
    expect(onCodeCleared).toHaveBeenCalledTimes(1);
  });

  it('does not notify when resend fails', async () => {
    const api = createAuthApiMock({
      resendVerification: vi
        .fn()
        .mockRejectedValue(new ApiClientError('Boom', 500, 'INTERNAL')),
    });
    const onCodeCleared = vi.fn();
    const { result } = renderHook(
      () =>
        useVerifyEmailCodeForm({
          onVerified: vi.fn(),
          onCodeCleared,
          startHeld: false,
        }),
      { wrapper: createAuthWrapper(api) }
    );

    act(() => result.current.onCodeChange(CODE));
    act(() => result.current.onResend());

    await waitFor(() =>
      expect(result.current.resendNotice?.tone).toBe('error')
    );
    expect(result.current.code).toBe(CODE);
    expect(onCodeCleared).not.toHaveBeenCalled();
  });

  it('does not notify when verification succeeds', async () => {
    const api = createAuthApiMock();
    const onVerified = vi.fn();
    const onCodeCleared = vi.fn();
    const { result } = renderHook(
      () =>
        useVerifyEmailCodeForm({
          onVerified,
          onCodeCleared,
          startHeld: false,
        }),
      { wrapper: createAuthWrapper(api) }
    );

    act(() => result.current.onCodeChange(CODE));
    act(() => result.current.onSubmit(submitEvent()));

    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(onCodeCleared).not.toHaveBeenCalled();
  });
});
