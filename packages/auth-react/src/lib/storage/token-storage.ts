type TokenChangeCallback = (hasToken: boolean) => void;

export interface TokenStorage {
  setAccessToken(token: string | null): void;
  getAccessToken(): string | null;
  setRefreshToken(token: string | null): void;
  getRefreshToken(): string | null;
  setTokens(accessToken: string, refreshToken: string): void;
  clearTokens(): void;
  hasTokens(): boolean;
  subscribe(callback: TokenChangeCallback): () => void;
  initialize(): { hasRefreshToken: boolean };
}

export interface TokenStorageOptions {
  /** localStorage key for the refresh token */
  refreshTokenKey?: string;
}

const DEFAULT_REFRESH_TOKEN_KEY = 'auth_refresh_token';

/**
 * Creates a token storage instance.
 * Access token is kept in-memory, refresh token in localStorage.
 */
export function createTokenStorage(
  options?: TokenStorageOptions
): TokenStorage {
  const refreshTokenKey = options?.refreshTokenKey ?? DEFAULT_REFRESH_TOKEN_KEY;
  let accessToken: string | null = null;
  const listeners = new Set<TokenChangeCallback>();

  function notifyListeners(): void {
    const hasToken = accessToken !== null;
    listeners.forEach((cb) => cb(hasToken));
  }

  return {
    setAccessToken(token: string | null): void {
      accessToken = token;
      notifyListeners();
    },

    getAccessToken(): string | null {
      return accessToken;
    },

    setRefreshToken(token: string | null): void {
      if (typeof window === 'undefined') {
        return;
      }

      if (token) {
        localStorage.setItem(refreshTokenKey, token);
      } else {
        localStorage.removeItem(refreshTokenKey);
      }
    },

    getRefreshToken(): string | null {
      if (typeof window === 'undefined') {
        return null;
      }
      return localStorage.getItem(refreshTokenKey);
    },

    setTokens(accessTokenValue: string, refreshTokenValue: string): void {
      this.setAccessToken(accessTokenValue);
      this.setRefreshToken(refreshTokenValue);
    },

    clearTokens(): void {
      this.setAccessToken(null);
      this.setRefreshToken(null);
    },

    hasTokens(): boolean {
      return accessToken !== null;
    },

    subscribe(callback: TokenChangeCallback): () => void {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },

    initialize(): { hasRefreshToken: boolean } {
      return {
        hasRefreshToken: this.getRefreshToken() !== null,
      };
    },
  };
}
