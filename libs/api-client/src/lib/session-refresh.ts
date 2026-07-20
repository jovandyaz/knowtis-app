import type { AuthTokens } from '@jovandyaz/auth';
import type { TokenStorage } from '@jovandyaz/auth-react';

import type { IHttpClient } from './http-client';

/** Web Lock name shared by every refresh path so refreshes serialize across
 *  tabs of the same browser. */
export const AUTH_REFRESH_LOCK = 'knowtis-auth-refresh';

let inflightRefresh: Promise<AuthTokens> | null = null;

/** Runs `task` while holding the cross-tab refresh lock; falls back to a direct
 *  call where the Web Locks API is unavailable. */
export function withAuthRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(AUTH_REFRESH_LOCK, task) as Promise<T>;
  }
  return task();
}

/** In-tab single-flight plus the cross-tab lock, so concurrent callers and
 *  sibling tabs never consume the rotating refresh token twice. */
export function refreshSessionTokens(
  httpClient: IHttpClient,
  tokenStorage: TokenStorage
): Promise<AuthTokens> {
  if (inflightRefresh) {
    return inflightRefresh;
  }
  inflightRefresh = withAuthRefreshLock(() =>
    rotateTokens(httpClient, tokenStorage)
  ).finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

async function rotateTokens(
  httpClient: IHttpClient,
  tokenStorage: TokenStorage
): Promise<AuthTokens> {
  const tokens = await httpClient.post<AuthTokens>(
    '/auth/refresh',
    {},
    { skipAuth: true }
  );
  tokenStorage.setAccessToken(tokens.accessToken);
  return tokens;
}
