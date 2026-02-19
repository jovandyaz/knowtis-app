import { createContext, useContext, useMemo } from 'react';

import type { TokenStorage } from '../storage/token-storage';
import type { AuthStoreInstance } from '../store/auth.store';
import type { AuthApiAdapter } from '../types';

interface AuthContextValue {
  api: AuthApiAdapter;
  tokenStorage: TokenStorage;
  store: AuthStoreInstance;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  /** Auth API adapter implementation */
  api: AuthApiAdapter;
  /** Token storage instance */
  tokenStorage: TokenStorage;
  /** Zustand auth store instance */
  store: AuthStoreInstance;
  children: React.ReactNode;
}

/**
 * Provides auth API adapter, token storage, and store to child components.
 */
export function AuthProvider({
  api,
  tokenStorage,
  store,
  children,
}: AuthProviderProps) {
  const value = useMemo(
    () => ({ api, tokenStorage, store }),
    [api, tokenStorage, store]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

/**
 * Returns the auth API adapter from context.
 */
export function useAuthApi(): AuthApiAdapter {
  return useAuthContext().api;
}

/**
 * Returns the token storage instance from context.
 */
export function useTokenStorage(): TokenStorage {
  return useAuthContext().tokenStorage;
}

/**
 * Returns the auth store instance from context.
 */
export function useAuthStore(): AuthStoreInstance {
  return useAuthContext().store;
}
