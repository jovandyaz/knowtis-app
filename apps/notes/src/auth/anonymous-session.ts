import {
  readPersistedAuth,
  type AuthStoreInstance,
  type TokenStorage,
} from '@jovandyaz/auth-react';

import { httpClient } from '@knowtis/api-client';

import { ANON_STORAGE_KEY, AUTH_STORAGE_KEY } from './constants';
import { SessionExpiredError } from './init-auth';

interface StoredAnonymousSession {
  userId: string;
  accessToken: string;
  expiresAt: number;
}

export interface AnonymousSessionResponse {
  user: { id: string; name: string; isAnonymous: boolean };
  accessToken: string;
}

function getJwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function wasPreviouslyRegistered(): boolean {
  const snapshot = readPersistedAuth(AUTH_STORAGE_KEY);
  return snapshot?.user != null && snapshot.user.isAnonymous !== true;
}

/** Single source of truth for creating a fresh anonymous session via the server.
 *  Used by bootstrap (initAnonymousSession) and the http-client refresh callback. */
export async function createAnonymousSession(
  tokenStorage: TokenStorage,
  authStore: AuthStoreInstance
): Promise<AnonymousSessionResponse> {
  const response = await httpClient.post<AnonymousSessionResponse>(
    '/auth/anonymous',
    {},
    { skipAuth: true }
  );
  tokenStorage.setAccessToken(response.accessToken);
  authStore.getState().setUser({
    id: response.user.id,
    email: '',
    name: response.user.name,
    avatarUrl: null,
    isAnonymous: true,
  });
  persistAnonymousSession(response);
  return response;
}

/** Restores or creates an anonymous session; throws SessionExpiredError if the
 *  persisted snapshot was a registered user (avoids silent demotion). */
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

  const latest = authStore.getState();
  if (latest.isAuthenticated && !latest.user?.isAnonymous) {
    return;
  }

  if (wasPreviouslyRegistered()) {
    throw new SessionExpiredError();
  }

  try {
    await createAnonymousSession(tokenStorage, authStore);
  } catch (error) {
    console.warn('[AnonymousSession] Failed to create session:', error);
    authStore.getState().setLoading(false);
  }
}

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

export function getAnonymousSession(): StoredAnonymousSession | null {
  const stored = localStorage.getItem(ANON_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  let parsed: Partial<StoredAnonymousSession>;
  try {
    parsed = JSON.parse(stored) as Partial<StoredAnonymousSession>;
  } catch (error) {
    console.warn('[AnonymousSession] Failed to parse stored session', error);
    return null;
  }
  if (
    typeof parsed.userId !== 'string' ||
    typeof parsed.accessToken !== 'string' ||
    typeof parsed.expiresAt !== 'number' ||
    parsed.expiresAt < Date.now()
  ) {
    return null;
  }
  return parsed as StoredAnonymousSession;
}

export function getAnonymousUserId(): string | null {
  return getAnonymousSession()?.userId ?? null;
}

export function clearAnonymousSession(): void {
  localStorage.removeItem(ANON_STORAGE_KEY);
}
