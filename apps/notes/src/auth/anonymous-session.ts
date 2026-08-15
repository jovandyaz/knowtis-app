import {
  readPersistedAuth,
  type AuthStoreInstance,
  type TokenStorage,
} from '@jovandyaz/auth-react';

import {
  classifyRefreshFailure,
  httpClient,
  refreshSessionTokens,
  withAuthRefreshLock,
  type RefreshFailure,
} from '@knowtis/api-client';

import { ANON_STORAGE_KEY, AUTH_STORAGE_KEY } from './constants';
import { SessionExpiredError } from './init-auth';

interface StoredAnonymousMarker {
  userId: string;
  expiresAt: number;
  legacyAccessToken?: string;
}

export interface AnonymousSessionResponse {
  user: { id: string; name: string; isAnonymous: boolean };
  accessToken: string;
}

type RestoreOutcome = 'restored' | RefreshFailure;

const ANON_MARKER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function wasPreviouslyRegistered(): boolean {
  const snapshot = readPersistedAuth(AUTH_STORAGE_KEY);
  return snapshot?.user != null && snapshot.user.isAnonymous !== true;
}

function setAnonymousUser(
  authStore: AuthStoreInstance,
  userId: string,
  name = ''
): void {
  authStore.getState().setUser({
    id: userId,
    email: '',
    name,
    avatarUrl: null,
    isAnonymous: true,
  });
}

/** Single source of truth for creating a fresh anonymous session via the server.
 *  Only a non-sensitive continuity marker is persisted — the access token stays
 *  in memory and the refresh token lives in the HttpOnly cookie. */
export async function createAnonymousSession(
  tokenStorage: TokenStorage,
  authStore: AuthStoreInstance,
  legacyToken?: string
): Promise<AnonymousSessionResponse> {
  const response = await httpClient.post<AnonymousSessionResponse>(
    '/auth/anonymous',
    legacyToken ? { anonymousToken: legacyToken } : {},
    { skipAuth: true }
  );
  tokenStorage.setAccessToken(response.accessToken);
  setAnonymousUser(authStore, response.user.id, response.user.name);
  persistAnonymousMarker(response.user.id);
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

  const stored = readStoredMarker();
  if (stored) {
    const legacyToken = stored.legacyAccessToken;
    const outcome = legacyToken
      ? await withAuthRefreshLock(() =>
          migrateLegacySession(legacyToken, tokenStorage, authStore)
        )
      : await restoreSessionViaRefresh(stored, tokenStorage, authStore);
    if (outcome === 'restored') {
      return;
    }
    if (outcome === 'unavailable') {
      authStore.getState().setLoading(false);
      return;
    }
    localStorage.removeItem(ANON_STORAGE_KEY);
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

async function migrateLegacySession(
  legacyToken: string,
  tokenStorage: TokenStorage,
  authStore: AuthStoreInstance
): Promise<RestoreOutcome> {
  try {
    await createAnonymousSession(tokenStorage, authStore, legacyToken);
    return 'restored';
  } catch (error) {
    console.warn('[AnonymousSession] Legacy session migration failed:', error);
    return classifyRefreshFailure(error);
  }
}

async function restoreSessionViaRefresh(
  marker: StoredAnonymousMarker,
  tokenStorage: TokenStorage,
  authStore: AuthStoreInstance
): Promise<RestoreOutcome> {
  try {
    await refreshSessionTokens(httpClient, tokenStorage);
    if (!authStore.getState().isAuthenticated) {
      setAnonymousUser(authStore, marker.userId);
    }
    persistAnonymousMarker(marker.userId);
    return 'restored';
  } catch (error) {
    console.warn('[AnonymousSession] Session refresh failed:', error);
    return classifyRefreshFailure(error);
  }
}

export function persistAnonymousMarker(userId: string): void {
  localStorage.setItem(
    ANON_STORAGE_KEY,
    JSON.stringify({ userId, expiresAt: Date.now() + ANON_MARKER_TTL_MS })
  );
}

function readStoredMarker(): StoredAnonymousMarker | null {
  const stored = localStorage.getItem(ANON_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  let parsed: Partial<StoredAnonymousMarker> & { accessToken?: unknown };
  try {
    parsed = JSON.parse(stored) as Partial<StoredAnonymousMarker> & {
      accessToken?: unknown;
    };
  } catch (error) {
    console.warn('[AnonymousSession] Failed to parse stored session', error);
    localStorage.removeItem(ANON_STORAGE_KEY);
    return null;
  }
  if (
    typeof parsed.userId !== 'string' ||
    typeof parsed.expiresAt !== 'number' ||
    parsed.expiresAt < Date.now()
  ) {
    localStorage.removeItem(ANON_STORAGE_KEY);
    return null;
  }
  return {
    userId: parsed.userId,
    expiresAt: parsed.expiresAt,
    ...(typeof parsed.accessToken === 'string' &&
      parsed.accessToken && { legacyAccessToken: parsed.accessToken }),
  };
}

export function getAnonymousUserId(): string | null {
  const stored = localStorage.getItem(ANON_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    const parsed = JSON.parse(stored) as Partial<StoredAnonymousMarker>;
    if (
      typeof parsed.userId !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt < Date.now()
    ) {
      return null;
    }
    return parsed.userId;
  } catch (error) {
    console.warn('[AnonymousSession] Failed to parse stored session', error);
    return null;
  }
}

export function clearAnonymousSession(): void {
  localStorage.removeItem(ANON_STORAGE_KEY);
}
