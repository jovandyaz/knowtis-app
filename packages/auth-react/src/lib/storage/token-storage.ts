type TokenChangeCallback = (hasToken: boolean) => void;

export interface TokenStorage {
  setAccessToken(token: string | null): void;
  getAccessToken(): string | null;
  clearTokens(): void;
  hasTokens(): boolean;
  subscribe(callback: TokenChangeCallback): () => void;
}

export function createTokenStorage(): TokenStorage {
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

    clearTokens(): void {
      accessToken = null;
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
