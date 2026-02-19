import type { AuthResponse } from '@jovandyaz/auth';

import type { AuthUserProfile } from '../types';

export interface AuthState {
  user: AuthUserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

/**
 * Authentication actions
 */
export interface AuthActions {
  setUser: (user: AuthUserProfile | null) => void;
  handleAuthSuccess: (response: AuthResponse) => void;
  logout: () => void;
  setLoading: (isLoading: boolean) => void;
}

/**
 * Combined auth store type
 */
export type AuthStore = AuthState & AuthActions;
