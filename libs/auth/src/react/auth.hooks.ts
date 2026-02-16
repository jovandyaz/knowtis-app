import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toast } from 'sonner';

import { ApiClientError } from '@knowtis/api-client';
import type {
  AuthResponse,
  LoginInput,
  RegisterInput,
  UserProfile,
} from '@knowtis/shared-types';

import { authApi } from '../api';
import { useAuthStore } from './auth.store';

export const authQueryKeys = {
  all: ['auth'] as const,
  profile: () => [...authQueryKeys.all, 'profile'] as const,
} as const;

export function useProfile() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setUser = useAuthStore((state) => state.setUser);

  return useQuery({
    queryKey: authQueryKeys.profile(),
    queryFn: async (): Promise<UserProfile> => {
      const profile = await authApi.getProfile();
      setUser({
        id: profile.id,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      });
      return profile;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useLogin() {
  const handleAuthSuccess = useAuthStore((state) => state.handleAuthSuccess);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (response: AuthResponse) => {
      handleAuthSuccess(response);
      queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
      toast.success('Welcome back!');
    },
    onError: (error) => {
      if (ApiClientError.isApiClientError(error) && error.status === 429) {
        toast.error('Too many attempts. Please try again later.');
      }
    },
  });
}

export function useRegister() {
  const handleAuthSuccess = useAuthStore((state) => state.handleAuthSuccess);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (response: AuthResponse) => {
      handleAuthSuccess(response);
      queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
      toast.success('Account created successfully!');
    },
    onError: (error) => {
      if (ApiClientError.isApiClientError(error) && error.status === 429) {
        toast.error('Too many attempts. Please try again later.');
      }
    },
  });
}

export function useLogout() {
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      logout();
      queryClient.clear();
      toast.success('Signed out successfully');
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
    onSuccess: () => {
      toast.success('If the email exists, a reset link will be sent.');
    },
    onError: (error) => {
      if (ApiClientError.isApiClientError(error) && error.status === 429) {
        toast.error('Too many attempts. Please try again later.');
      }
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({
      token,
      newPassword,
    }: {
      token: string;
      newPassword: string;
    }) => authApi.resetPassword(token, newPassword),
    onSuccess: () => {
      toast.success('Password has been reset successfully!');
    },
    onError: (error) => {
      if (ApiClientError.isApiClientError(error) && error.status === 429) {
        toast.error('Too many attempts. Please try again later.');
      }
    },
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) => authApi.verifyEmail(token),
    onSuccess: () => {
      toast.success('Email verified successfully!');
    },
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => authApi.resendVerification(),
    onSuccess: () => {
      toast.success('Verification email sent. Please check your inbox.');
    },
    onError: (error) => {
      if (ApiClientError.isApiClientError(error) && error.status === 429) {
        toast.error('Too many attempts. Please try again later.');
      }
    },
  });
}

export function useRateLimitState() {
  const [rateLimited, setRateLimited] = useState(false);

  const checkRateLimit = (error: unknown): boolean => {
    if (ApiClientError.isApiClientError(error) && error.status === 429) {
      setRateLimited(true);
      return true;
    }
    return false;
  };

  const resetRateLimit = () => setRateLimited(false);

  return { rateLimited, checkRateLimit, resetRateLimit };
}
