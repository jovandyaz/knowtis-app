import type {
  AuthResponse,
  AuthTokens,
  LoginInput,
  RegisterInput,
} from '@jovandyaz/auth';
import type {
  AuthApiAdapter,
  AuthUserProfile,
  TokenStorage,
} from '@jovandyaz/auth-react';

import type { IHttpClient } from '@knowtis/api-client';

interface CreateAuthApiAdapterDeps {
  httpClient: IHttpClient;
  tokenStorage: TokenStorage;
}

export function createAuthApiAdapter(
  deps: CreateAuthApiAdapterDeps
): AuthApiAdapter {
  const { httpClient, tokenStorage } = deps;

  const adapter: AuthApiAdapter = {
    async login(input: LoginInput): Promise<AuthResponse> {
      const response = await httpClient.post<AuthResponse>(
        '/auth/login',
        input,
        { skipAuth: true }
      );

      tokenStorage.setTokens(
        response.tokens.accessToken,
        response.tokens.refreshToken
      );

      return response;
    },

    async register(input: RegisterInput): Promise<AuthResponse> {
      const response = await httpClient.post<AuthResponse>(
        '/auth/register',
        input,
        { skipAuth: true }
      );

      tokenStorage.setTokens(
        response.tokens.accessToken,
        response.tokens.refreshToken
      );

      return response;
    },

    async logout(): Promise<void> {
      const refreshToken = tokenStorage.getRefreshToken();
      if (refreshToken) {
        await httpClient.post('/auth/logout', { refreshToken }).catch(() => {});
      }
      tokenStorage.clearTokens();
    },

    async refreshToken(): Promise<AuthTokens> {
      const refreshToken = tokenStorage.getRefreshToken();

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await httpClient.post<AuthTokens>(
        '/auth/refresh',
        { refreshToken },
        { skipAuth: true }
      );

      tokenStorage.setTokens(response.accessToken, response.refreshToken);

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
    try {
      const tokens = await adapter.refreshToken();
      return tokens.accessToken;
    } catch {
      void adapter.logout();
      return null;
    }
  });

  return adapter;
}
