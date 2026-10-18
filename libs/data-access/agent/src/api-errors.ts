import { ApiClientError } from '@knowtis/api-client';

export const NOT_FOUND_STATUS = 404;

/** True when the API answered 404: the conversation or memory is gone, or was never the caller's. */
export function isGone(error: unknown): boolean {
  return (
    ApiClientError.isApiClientError(error) && error.status === NOT_FOUND_STATUS
  );
}
