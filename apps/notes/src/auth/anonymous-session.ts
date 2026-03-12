import type { AuthStoreInstance, TokenStorage } from '@jovandyaz/auth-react';

import { httpClient } from '@knowtis/api-client';

const ANON_STORAGE_KEY = 'knowtis-anon';

interface StoredAnonymousSession {
  userId: string;
  accessToken: string;
  expiresAt: number;
}

export interface AnonymousSessionResponse {
  user: { id: string; name: string; isAnonymous: boolean };
  accessToken: string;
}

/**
 * Decode JWT payload without verification (server verifies on each request).
 * Used only to extract the `exp` claim for localStorage expiry sync.
 */
function getJwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Initialize anonymous session if no auth exists.
 * Called during app initialization.
 *
 * SECURITY NOTE: The anonymous JWT is stored in localStorage (not HttpOnly cookies).
 * This is an accepted risk because:
 * 1. Anonymous accounts are ephemeral (30-day TTL, auto-cleaned by cron)
 * 2. Anonymous data is limited (max 5 notes)
 * 3. No sensitive personal data (no email, no password)
 * 4. Moving to HttpOnly cookies would require significant backend changes
 *    (cookie-based auth flow for anonymous sessions) with minimal security benefit
 * 5. If XSS occurs, authenticated users' refresh tokens (HttpOnly) remain safe
 */
export async function initAnonymousSession(
  tokenStorage: TokenStorage,
  authStore: AuthStoreInstance
): Promise<void> {
  const { isAuthenticated, user } = authStore.getState();

  if (isAuthenticated && !user?.isAnonymous) {
    return;
  }

  const stored = localStorage.getItem(ANON_STORAGE_KEY);
  if (stored) {
    try {
      const session: StoredAnonymousSession = JSON.parse(stored);

      if (session.expiresAt < Date.now()) {
        localStorage.removeItem(ANON_STORAGE_KEY);
      } else {
        tokenStorage.setAccessToken(session.accessToken);
        if (!isAuthenticated) {
          authStore.getState().setUser({
            id: session.userId,
            email: '',
            name: '',
            avatarUrl: null,
            isAnonymous: true,
          });
        }
        return;
      }
    } catch (error) {
      console.warn(
        '[AnonymousSession] Failed to parse stored session, removing',
        error
      );
      localStorage.removeItem(ANON_STORAGE_KEY);
    }
  }

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
      name: '',
      avatarUrl: null,
      isAnonymous: true,
    });

    persistAnonymousSession(response);
  } catch (error) {
    console.warn('[AnonymousSession] Failed to create session:', error);
    authStore.getState().setLoading(false);
  }
}

/**
 * Persist anonymous session response to localStorage.
 * Used by both initAnonymousSession and the token recovery callback.
 */
export function persistAnonymousSession(
  response: AnonymousSessionResponse
): void {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const expiresAt =
    getJwtExpiry(response.accessToken) ?? Date.now() + THIRTY_DAYS_MS;
  localStorage.setItem(
    ANON_STORAGE_KEY,
    JSON.stringify({
      userId: response.user.id,
      accessToken: response.accessToken,
      expiresAt,
    })
  );
}

/**
 * Get the full anonymous session data if one exists.
 * Used during registration/login to send token for ownership verification.
 */
export function getAnonymousSession(): StoredAnonymousSession | null {
  const stored = localStorage.getItem(ANON_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as StoredAnonymousSession;
  } catch (error) {
    console.warn('[AnonymousSession] Failed to parse stored session', error);
    return null;
  }
}

/**
 * Get the anonymous user ID if one exists.
 * Used for UI checks (e.g., showing migration message on register page).
 */
export function getAnonymousUserId(): string | null {
  return getAnonymousSession()?.userId ?? null;
}

/**
 * Clear anonymous session data.
 * Called after successful registration.
 */
export function clearAnonymousSession(): void {
  localStorage.removeItem(ANON_STORAGE_KEY);
}
