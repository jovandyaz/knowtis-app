import { useEffect, useState } from 'react';

import {
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
      queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
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
      queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
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

export function useVerifyEmail(): UseMutationResult<void, Error, string> {
  const api = useAuthApi();

  return useMutation({
    mutationFn: (token: string) => api.verifyEmail(token),
  });
}

export function useResendVerification(): UseMutationResult<void, Error, void> {
  const api = useAuthApi();

  return useMutation({
    mutationFn: () => api.resendVerification(),
  });
}

export function useRateLimitState() {
  const [rateLimited, setRateLimited] = useState(false);

  const checkRateLimit = (error: unknown): boolean => {
    if (
      error instanceof Error &&
      'status' in error &&
      (error as Error & { status: number }).status === 429
    ) {
      setRateLimited(true);
      return true;
    }
    return false;
  };

  const resetRateLimit = () => setRateLimited(false);

  return { rateLimited, checkRateLimit, resetRateLimit };
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
