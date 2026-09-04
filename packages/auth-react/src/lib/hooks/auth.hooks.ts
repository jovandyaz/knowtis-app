import { useEffect } from 'react';

import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { AuthResponse, LoginInput, RegisterInput } from '@jovandyaz/auth';

import { useAuthApi, useAuthStore } from '../provider/auth-provider';
import type { AuthUserProfile } from '../types';

export const authQueryKeys = {
  all: ['auth'] as const,
  profile: () => [...authQueryKeys.all, 'profile'] as const,
  verifyEmail: (token: string | undefined) =>
    [...authQueryKeys.all, 'verify-email', token] as const,
} as const;

export function useProfile(): UseQueryResult<AuthUserProfile> {
  const api = useAuthApi();
  const store = useAuthStore();
  const isAuthenticated = store((state) => state.isAuthenticated);
  const setUser = store((state) => state.setUser);

  const query = useQuery({
    queryKey: authQueryKeys.profile(),
    queryFn: (): Promise<AuthUserProfile> => api.getProfile(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (query.data) {
      setUser(query.data);
    }
  }, [query.data, setUser]);

  return query;
}

export function useLogin(): UseMutationResult<AuthResponse, Error, LoginInput> {
  const api = useAuthApi();
  const store = useAuthStore();
  const handleAuthSuccess = store((state) => state.handleAuthSuccess);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginInput) => api.login(input),
    onSuccess: (response: AuthResponse) => {
      handleAuthSuccess(response);
      queryClient.clear();
    },
  });
}

export function useRegister(): UseMutationResult<
  AuthResponse,
  Error,
  RegisterInput
> {
  const api = useAuthApi();
  const store = useAuthStore();
  const handleAuthSuccess = store((state) => state.handleAuthSuccess);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RegisterInput) => api.register(input),
    onSuccess: (response: AuthResponse) => {
      handleAuthSuccess(response);
      queryClient.clear();
    },
  });
}

export function useLogout(): UseMutationResult<void, Error, void> {
  const api = useAuthApi();
  const store = useAuthStore();
  const logout = store((state) => state.logout);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.cancelQueries();
      logout();
      queryClient.clear();
    },
  });
}

export function useForgotPassword(): UseMutationResult<void, Error, string> {
  const api = useAuthApi();

  return useMutation({
    mutationFn: (email: string) => api.forgotPassword(email),
  });
}

export function useResetPassword(): UseMutationResult<
  void,
  Error,
  { token: string; newPassword: string }
> {
  const api = useAuthApi();

  return useMutation({
    mutationFn: ({
      token,
      newPassword,
    }: {
      token: string;
      newPassword: string;
    }) => api.resetPassword(token, newPassword),
  });
}

/**
 * Redeems the token an email link carried. The server consumes the token on
 * the first attempt, so the request is a query keyed by it: a StrictMode
 * remount, a refocus or a second visit with the same link within the session
 * all read the one cached outcome instead of posting again.
 */
export function useVerifyEmail(
  token: string | undefined
): UseQueryResult<true, Error> {
  const api = useAuthApi();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: authQueryKeys.verifyEmail(token),
    queryFn: token
      ? async () => {
          await api.verifyEmail(token);
          // Same contract as the code path: without this the banner outlives a
          // successful link verification for the profile query's whole staleTime.
          await queryClient.invalidateQueries({
            queryKey: authQueryKeys.profile(),
          });
          return true as const;
        }
      : skipToken,
    retry: false,
    retryOnMount: false,
    staleTime: 'static',
    gcTime: Infinity,
  });
}

export function useVerifyEmailCode(): UseMutationResult<void, Error, string> {
  const api = useAuthApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code: string) => api.verifyEmailCode(code),
    // Returning the promise keeps the mutation pending until the refreshed
    // profile lands, so callers never render success against a stale one.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: authQueryKeys.profile() }),
  });
}

export function useResendVerification(): UseMutationResult<void, Error, void> {
  const api = useAuthApi();

  return useMutation({
    mutationFn: () => api.resendVerification(),
  });
}

/**
 * Convenience hooks for reading auth store state
 */
export function useAuth() {
  const store = useAuthStore();
  return store((state) => ({
    user: state.user,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
  }));
}

export function useAuthUser() {
  const store = useAuthStore();
  return store((state) => state.user);
}

export function useIsAuthenticated() {
  const store = useAuthStore();
  return store((state) => state.isAuthenticated);
}

export function useAuthLoading() {
  const store = useAuthStore();
  return store((state) => state.isLoading);
}
