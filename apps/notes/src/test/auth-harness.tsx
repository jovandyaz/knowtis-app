import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  AuthProvider,
  createAuthStore,
  createTokenStorage,
  type AuthApiAdapter,
  type AuthUserProfile,
} from '@jovandyaz/auth-react';
import { vi } from 'vitest';

export const HARNESS_PROFILE: AuthUserProfile = {
  id: 'user-1',
  email: 'jane@knowtis.app',
  name: 'Jane Doe',
  avatarUrl: null,
  emailVerifiedAt: null,
};

let harnessCount = 0;

export function createAuthApiMock(
  overrides: Partial<AuthApiAdapter> = {}
): AuthApiAdapter {
  return {
    login: vi.fn(),
    register: vi.fn().mockResolvedValue({
      user: {
        id: HARNESS_PROFILE.id,
        email: HARNESS_PROFILE.email,
        name: HARNESS_PROFILE.name,
        avatarUrl: null,
      },
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
    }),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    getProfile: vi.fn().mockResolvedValue(HARNESS_PROFILE),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
    verifyEmailCode: vi.fn().mockResolvedValue(undefined),
    resendVerification: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export interface AuthWrapperOptions {
  /** Primes the store the way `initAuth()` does before the app shell renders. */
  user?: AuthUserProfile;
}

/** Auth context only, for a test that already owns its `QueryClientProvider`. */
export function createAuthOnlyWrapper(
  api: AuthApiAdapter,
  { user }: AuthWrapperOptions = {}
) {
  const tokenStorage = createTokenStorage();
  const store = createAuthStore({
    tokenStorage,
    storageKey: `test-auth-${++harnessCount}`,
  });
  if (user) {
    store.getState().setUser(user);
  }

  return function AuthOnlyHarness({ children }: { children: ReactNode }) {
    return (
      <AuthProvider api={api} tokenStorage={tokenStorage} store={store}>
        {children}
      </AuthProvider>
    );
  };
}

export function createAuthWrapper(
  api: AuthApiAdapter,
  options: AuthWrapperOptions = {}
) {
  const AuthOnly = createAuthOnlyWrapper(api, options);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function AuthHarness({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthOnly>{children}</AuthOnly>
      </QueryClientProvider>
    );
  };
}
