import type { AuthResponse } from '@jovandyaz/auth';

/**
 * Authenticated user state
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Authentication state
 */
export interface AuthState {
  /** Current authenticated user or null */
  user: AuthUser | null;
  /** Whether auth state is being loaded */
  isLoading: boolean;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
}

/**
 * Authentication actions
 */
export interface AuthActions {
  /** Set user from auth response */
  setUser: (user: AuthUser | null) => void;
  /** Handle successful auth response */
  handleAuthSuccess: (response: AuthResponse) => void;
  /** Clear auth state (logout) */
  logout: () => void;
  /** Set loading state */
  setLoading: (isLoading: boolean) => void;
}

/**
 * Combined auth store type
 */
export type AuthStore = AuthState & AuthActions;
