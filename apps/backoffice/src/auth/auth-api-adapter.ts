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

interface CreateBackofficeAuthApiDeps {
  httpClient: IHttpClient;
  tokenStorage: TokenStorage;
}

/** Backoffice is an internal admin panel: no anonymous sessions, no
 *  self-service registration/password flows. Those operations reject. */
function notSupported(operation: string): Promise<never> {
  return Promise.reject(
    new Error(`backoffice auth: ${operation} not supported`)
  );
}

export function createBackofficeAuthApi({
  httpClient,
  tokenStorage,
}: CreateBackofficeAuthApiDeps): AuthApiAdapter {
  return {
    async login(input: LoginInput): Promise<AuthResponse> {
      const response = await httpClient.post<AuthResponse>(
        '/auth/login',
        input,
        { skipAuth: true }
      );
      tokenStorage.setAccessToken(response.tokens.accessToken);
      return response;
    },

    async logout(): Promise<void> {
      try {
        await httpClient.post('/auth/logout', {});
      } finally {
        tokenStorage.clearTokens();
      }
    },

    async refreshToken(): Promise<AuthTokens> {
      const tokens = await httpClient.post<AuthTokens>(
        '/auth/refresh',
        {},
        { skipAuth: true }
      );
      tokenStorage.setAccessToken(tokens.accessToken);
      return tokens;
    },

    async getProfile(): Promise<AuthUserProfile> {
      const { user } = await httpClient.get<{ user: AuthUserProfile }>(
        '/auth/me'
      );
      return user;
    },

    register(_input: RegisterInput): Promise<AuthResponse> {
      return notSupported('register');
    },
    forgotPassword(_email: string): Promise<void> {
      return notSupported('forgotPassword');
    },
    resetPassword(_token: string, _newPassword: string): Promise<void> {
      return notSupported('resetPassword');
    },
    verifyEmail(_token: string): Promise<void> {
      return notSupported('verifyEmail');
    },
    resendVerification(): Promise<void> {
      return notSupported('resendVerification');
    },
  };
}
