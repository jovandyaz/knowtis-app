import type {
  AuthResponse,
  AuthTokens,
  LoginInput,
  RegisterInput,
} from '@jovandyaz/auth';
import type {
  AuthApiAdapter,
  AuthStoreInstance,
  AuthUserProfile,
  TokenStorage,
} from '@jovandyaz/auth-react';

import type { IHttpClient } from '@knowtis/api-client';

import type { AnonymousSessionResponse } from './anonymous-session';
import {
  clearAnonymousSession,
  getAnonymousSession,
  persistAnonymousSession,
} from './anonymous-session';

interface CreateAuthApiAdapterDeps {
  httpClient: IHttpClient;
  tokenStorage: TokenStorage;
  authStore: AuthStoreInstance;
}

export function createAuthApiAdapter(
  deps: CreateAuthApiAdapterDeps
): AuthApiAdapter {
  const { httpClient, tokenStorage, authStore } = deps;

  const adapter: AuthApiAdapter = {
    async login(input: LoginInput): Promise<AuthResponse> {
      const anonSession = getAnonymousSession();
      const response = await httpClient.post<AuthResponse>(
        '/auth/login',
        {
          ...input,
          ...(anonSession && {
            anonymousUserId: anonSession.userId,
            anonymousToken: anonSession.accessToken,
          }),
        },
        { skipAuth: true }
      );

      clearAnonymousSession();
      tokenStorage.setAccessToken(response.tokens.accessToken);

      return response;
    },

    async register(input: RegisterInput): Promise<AuthResponse> {
      const anonSession = getAnonymousSession();
      const response = await httpClient.post<AuthResponse>(
        '/auth/register',
        {
          ...input,
          ...(anonSession && {
            anonymousUserId: anonSession.userId,
            anonymousToken: anonSession.accessToken,
          }),
        },
        { skipAuth: true }
      );

      clearAnonymousSession();
      tokenStorage.setAccessToken(response.tokens.accessToken);

      return response;
    },

    async logout(): Promise<void> {
      await httpClient.post('/auth/logout', {}).catch((error) => {
        console.warn(
          '[AuthApiAdapter] Server logout call failed (ignored):',
          error
        );
      });
      tokenStorage.clearTokens();
    },

    async refreshToken(): Promise<AuthTokens> {
      const response = await httpClient.post<AuthTokens>(
        '/auth/refresh',
        {},
        { skipAuth: true }
      );

      tokenStorage.setAccessToken(response.accessToken);

      return response;
    },

    async getProfile(): Promise<AuthUserProfile> {
      return httpClient.get<AuthUserProfile>('/auth/me');
    },

    async forgotPassword(email: string): Promise<void> {
      await httpClient.post(
        '/auth/forgot-password',
        { email },
        { skipAuth: true }
      );
    },

    async resetPassword(token: string, newPassword: string): Promise<void> {
      await httpClient.post(
        '/auth/reset-password',
        { token, newPassword },
        { skipAuth: true }
      );
    },

    async verifyEmail(token: string): Promise<void> {
      await httpClient.post(
        '/auth/verify-email',
        { token },
        { skipAuth: true }
      );
    },

    async resendVerification(): Promise<void> {
      await httpClient.post('/auth/resend-verification', {});
    },
  };

  httpClient.setTokenProvider(tokenStorage);

  httpClient.setRefreshTokenCallback(async () => {
    const user = authStore.getState().user;

    if (!user) {
      return null;
    }

    if (user.isAnonymous) {
      try {
        const response = await httpClient.post<AnonymousSessionResponse>(
          '/auth/anonymous',
          {},
          { skipAuth: true }
        );
        tokenStorage.setAccessToken(response.accessToken);
        authStore.getState().setUser({
          id: response.user.id,
          email: '',
          name: response.user.name,
          avatarUrl: null,
          isAnonymous: true,
        });
        persistAnonymousSession(response);
        return response.accessToken;
      } catch (error) {
        console.warn('[AuthApiAdapter] Anonymous token refresh failed:', error);
        return null;
      }
    }

    try {
      const tokens = await adapter.refreshToken();
      return tokens.accessToken;
    } catch (error) {
      console.warn(
        '[AuthApiAdapter] Token refresh failed, logging out:',
        error
      );
      void adapter.logout();
      return null;
    }
  });

  return adapter;
}
