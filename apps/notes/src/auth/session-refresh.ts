import type { AuthTokens } from '@jovandyaz/auth';
import type { TokenStorage } from '@jovandyaz/auth-react';

import type { IHttpClient } from '@knowtis/api-client';

let inflightRefresh: Promise<AuthTokens> | null = null;

/** Single-flight cookie refresh: concurrent callers share one in-flight
 *  request so the rotated refresh token is never consumed twice in a tab. */
export function refreshSessionTokens(
  httpClient: IHttpClient,
  tokenStorage: TokenStorage
): Promise<AuthTokens> {
  if (inflightRefresh) {
    return inflightRefresh;
  }
  inflightRefresh = (async () => {
    try {
      const tokens = await httpClient.post<AuthTokens>(
        '/auth/refresh',
        {},
        { skipAuth: true }
      );
      tokenStorage.setAccessToken(tokens.accessToken);
      return tokens;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}
