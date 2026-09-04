import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';

import {
  authQueryKeys,
  useVerifyEmail,
  useVerifyEmailCode,
} from '../hooks/auth.hooks';
import { AuthProvider } from '../provider/auth-provider';
import { createTokenStorage } from '../storage/token-storage';
import { createAuthStore } from '../store/auth.store';
import type { AuthApiAdapter, AuthUserProfile } from '../types';

const UNVERIFIED_PROFILE: AuthUserProfile = {
  id: '1',
  email: 'user@test.com',
  name: 'Test User',
  avatarUrl: null,
  emailVerifiedAt: null,
};

function createMockApi(
  overrides: Partial<AuthApiAdapter> = {}
): AuthApiAdapter {
  return {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    getProfile: vi.fn().mockResolvedValue(UNVERIFIED_PROFILE),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn().mockResolvedValue(undefined),
    verifyEmailCode: vi.fn().mockResolvedValue(undefined),
    resendVerification: vi.fn(),
    ...overrides,
  };
}

function setup(api: AuthApiAdapter) {
  const tokenStorage = createTokenStorage();
  const store = createAuthStore({
    tokenStorage,
    storageKey: `test-verify-code-${Math.random()}`,
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, {
      client: queryClient,
      children: createElement(AuthProvider, {
        api,
        tokenStorage,
        store,
        children,
      }),
    });

  return { queryClient, wrapper };
}

describe('useVerifyEmailCode', () => {
  it('submits the code through the auth API adapter', async () => {
    const api = createMockApi();
    const { wrapper } = setup(api);

    const { result } = renderHook(() => useVerifyEmailCode(), { wrapper });
    result.current.mutate('123456');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.verifyEmailCode).toHaveBeenCalledWith('123456');
  });

  it('invalidates the cached profile so the verified flag refreshes', async () => {
    const api = createMockApi();
    const { queryClient, wrapper } = setup(api);
    queryClient.setQueryData(authQueryKeys.profile(), UNVERIFIED_PROFILE);

    const { result } = renderHook(() => useVerifyEmailCode(), { wrapper });
    result.current.mutate('123456');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryState(authQueryKeys.profile())?.isInvalidated
    ).toBe(true);
  });

  it('leaves the cached profile alone when the code is rejected', async () => {
    const api = createMockApi({
      verifyEmailCode: vi.fn().mockRejectedValue(new Error('Invalid code')),
    });
    const { queryClient, wrapper } = setup(api);
    queryClient.setQueryData(authQueryKeys.profile(), UNVERIFIED_PROFILE);

    const { result } = renderHook(() => useVerifyEmailCode(), { wrapper });
    result.current.mutate('000000');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      queryClient.getQueryState(authQueryKeys.profile())?.isInvalidated
    ).toBe(false);
  });
});

describe('useVerifyEmail', () => {
  it('submits the emailed token through the auth API adapter', async () => {
    const api = createMockApi();
    const { wrapper } = setup(api);

    const { result } = renderHook(() => useVerifyEmail('link-token'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.verifyEmail).toHaveBeenCalledWith('link-token');
  });

  it('sends nothing until a token is in hand', () => {
    const api = createMockApi();
    const { wrapper } = setup(api);

    const { result } = renderHook(() => useVerifyEmail(undefined), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(api.verifyEmail).not.toHaveBeenCalled();
  });

  it('posts a token once, however often the observer remounts', async () => {
    const api = createMockApi();
    const { wrapper } = setup(api);

    const first = renderHook(() => useVerifyEmail('link-token'), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => useVerifyEmail('link-token'), {
      wrapper,
    });

    expect(second.result.current.isSuccess).toBe(true);
    expect(second.result.current.isFetching).toBe(false);
    expect(api.verifyEmail).toHaveBeenCalledTimes(1);
  });

  it('keeps a refusal instead of retrying the consumed token on remount', async () => {
    const api = createMockApi({
      verifyEmail: vi.fn().mockRejectedValue(new Error('Expired')),
    });
    const { wrapper } = setup(api);

    const first = renderHook(() => useVerifyEmail('stale-token'), {
      wrapper,
    });
    await waitFor(() => expect(first.result.current.isError).toBe(true));
    first.unmount();

    const second = renderHook(() => useVerifyEmail('stale-token'), {
      wrapper,
    });

    expect(second.result.current.isError).toBe(true);
    expect(second.result.current.isFetching).toBe(false);
    expect(api.verifyEmail).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cached profile, exactly as the code path does', async () => {
    const api = createMockApi();
    const { queryClient, wrapper } = setup(api);
    queryClient.setQueryData(authQueryKeys.profile(), UNVERIFIED_PROFILE);

    const { result } = renderHook(() => useVerifyEmail('link-token'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryState(authQueryKeys.profile())?.isInvalidated
    ).toBe(true);
  });

  it('leaves the cached profile alone when the link is rejected', async () => {
    const api = createMockApi({
      verifyEmail: vi.fn().mockRejectedValue(new Error('Expired')),
    });
    const { queryClient, wrapper } = setup(api);
    queryClient.setQueryData(authQueryKeys.profile(), UNVERIFIED_PROFILE);

    const { result } = renderHook(() => useVerifyEmail('stale-token'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      queryClient.getQueryState(authQueryKeys.profile())?.isInvalidated
    ).toBe(false);
  });
});
