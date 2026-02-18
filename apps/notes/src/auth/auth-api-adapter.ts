import type {
  AuthApiAdapter,
  AuthUserProfile,
  TokenStorage,
} from '@jovandyaz/auth-react';
import type {
  AuthResponse,
  AuthTokens,
  LoginInput,
  RegisterInput,
} from '@jovandyaz/auth/client';

/**
 * Minimal HTTP client interface.
 * Defined locally to keep the adapter loosely coupled from `@knowtis/api-client`.
 */
export interface HttpClient {
  get<T>(endpoint: string, options?: { skipAuth?: boolean }): Promise<T>;
  post<T>(
    endpoint: string,
    data?: unknown,
    options?: { skipAuth?: boolean }
  ): Promise<T>;
  setRefreshTokenCallback(callback: () => Promise<string | null>): void;
}

interface CreateAuthApiAdapterDeps {
  httpClient: HttpClient;
  tokenStorage: TokenStorage;
}

/**
 * Factory that creates an `AuthApiAdapter` bridging Knowtis' httpClient
 * to the `@jovandyaz/auth-react` interface.
 *
 * Side effect: registers a refresh-token callback on `httpClient` so that
 * 401 responses are retried automatically with a fresh access token.
 */
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

  // Register refresh callback so httpClient can retry on 401
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
