import { parseTokenExpiry } from '../utils/token-expiry';

type TokenChangeCallback = (hasToken: boolean) => void;

export interface TokenStorage {
  setAccessToken(token: string | null): void;
  getAccessToken(): string | null;
  getExpiresAt(): number | null;
  clearTokens(): void;
  hasTokens(): boolean;
  subscribe(callback: TokenChangeCallback): () => void;
}

export function createTokenStorage(): TokenStorage {
  let accessToken: string | null = null;
  let expiresAt: number | null = null;
  const listeners = new Set<TokenChangeCallback>();

  function notifyListeners(): void {
    const hasToken = accessToken !== null;
    listeners.forEach((cb) => cb(hasToken));
  }

  return {
    setAccessToken(token: string | null): void {
      accessToken = token;
      expiresAt = token ? parseTokenExpiry(token) : null;
      notifyListeners();
    },

    getAccessToken(): string | null {
      return accessToken;
    },

    getExpiresAt(): number | null {
      return expiresAt;
    },

    clearTokens(): void {
      accessToken = null;
      expiresAt = null;
      notifyListeners();
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
  };
}
