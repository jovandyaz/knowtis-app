import { useCallback, useState } from 'react';

import { ApiClientError } from '@knowtis/api-client';

const TOO_MANY_REQUESTS = 429;

export interface RateLimitState {
  rateLimited: boolean;
  /** True when the API itself throttled the call, so the caller can say so. */
  checkRateLimit: (error: unknown) => boolean;
  resetRateLimit: () => void;
}

export function useRateLimitState(): RateLimitState {
  const [rateLimited, setRateLimited] = useState(false);

  const checkRateLimit = useCallback((error: unknown): boolean => {
    if (
      !ApiClientError.isApiClientError(error) ||
      error.status !== TOO_MANY_REQUESTS
    ) {
      return false;
    }
    setRateLimited(true);
    return true;
  }, []);

  const resetRateLimit = useCallback(() => setRateLimited(false), []);

  return { rateLimited, checkRateLimit, resetRateLimit };
}
