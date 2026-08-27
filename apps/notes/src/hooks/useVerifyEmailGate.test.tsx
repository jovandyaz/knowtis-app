import type { ReactNode } from 'react';
import { act } from 'react';

import { useVerifyEmailStore } from '@/stores/verify-email.store';
import type { AuthUserProfile } from '@jovandyaz/auth-react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';
import { EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

import { createAuthApiMock, createAuthWrapper } from '../test/auth-harness';
import { useVerifyEmailGate } from './useVerifyEmailGate';

const toastError = vi.fn();

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const ACCOUNT: AuthUserProfile = {
  id: 'user-1',
  email: 'jane@knowtis.app',
  name: 'Jane Doe',
  avatarUrl: null,
  emailVerifiedAt: null,
};

const GATE_ERROR = new ApiClientError(
  'Verify your email',
  403,
  EMAIL_NOT_VERIFIED_CODE
);

function renderGate(user?: AuthUserProfile) {
  const wrapper = createAuthWrapper(createAuthApiMock(), user ? { user } : {});
  return renderHook(() => useVerifyEmailGate(), {
    wrapper: ({ children }: { children: ReactNode }) => wrapper({ children }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useVerifyEmailStore.setState({ isOpen: false, source: 'inApp' });
});

describe('useVerifyEmailGate', () => {
  it('turns the gate refusal into an offer to verify', () => {
    const { result } = renderGate(ACCOUNT);

    let handled = false;
    act(() => {
      handled = result.current.handleError(GATE_ERROR);
    });

    expect(handled).toBe(true);
    expect(useVerifyEmailStore.getState().isOpen).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('leaves any other failure to the caller', () => {
    const { result } = renderGate(ACCOUNT);

    let handled = true;
    act(() => {
      handled = result.current.handleError(
        new ApiClientError('Forbidden', 403, 'NOTE_ACCESS_DENIED')
      );
    });

    expect(handled).toBe(false);
    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });

  it('never asks an anonymous visitor for a code they cannot receive', () => {
    const { result } = renderGate({ ...ACCOUNT, isAnonymous: true });

    act(() => {
      result.current.handleError(GATE_ERROR);
    });

    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
    expect(result.current.canVerify).toBe(false);
  });

  it('points an anonymous visitor at the account they would need', () => {
    const { result } = renderGate({ ...ACCOUNT, isAnonymous: true });

    let handled = false;
    act(() => {
      handled = result.current.handleError(GATE_ERROR);
    });

    expect(toastError).toHaveBeenCalledWith('verifyEmail.gateSignUpToast');
    expect(handled).toBe(true);
  });

  it('offers verification directly for a refusal that never crossed HTTP', () => {
    const { result } = renderGate(ACCOUNT);

    act(() => {
      result.current.prompt();
    });

    expect(useVerifyEmailStore.getState().isOpen).toBe(true);
  });

  it('points a visitor with no session at the account they would need', () => {
    const { result } = renderGate();

    act(() => {
      result.current.prompt();
    });

    expect(result.current.canVerify).toBe(false);
    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
    expect(toastError).toHaveBeenCalledWith('verifyEmail.gateSignUpToast');
  });
});
