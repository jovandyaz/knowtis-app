import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { queryClient } from './query-client';

vi.mock('@/auth', () => ({
  authStore: { getState: () => ({ user: null }) },
  redirectToLoginWithReload: vi.fn(),
}));

function queryRetryPolicy() {
  const retry = queryClient.getDefaultOptions().queries?.retry;
  if (typeof retry !== 'function') {
    throw new Error('the query client has no retry policy');
  }
  return retry;
}

describe('query retry policy', () => {
  it.each([
    ['a 404 for a note that is gone', new ApiClientError('Not found', 404)],
    ['a 403 for a note shared away', new ApiClientError('Forbidden', 403)],
    ['a 401 for a dead session', new ApiClientError('Unauthorized', 401)],
  ])('never repeats %s', (_label, error) => {
    expect(queryRetryPolicy()(0, error)).toBe(false);
  });

  it.each([
    ['a 503', new ApiClientError('Unavailable', 503)],
    [
      'a network failure',
      new ApiClientError('Failed to fetch', 0, 'NETWORK_ERROR'),
    ],
  ])('retries %s once', (_label, error) => {
    const retry = queryRetryPolicy();
    expect([retry(0, error), retry(1, error)]).toEqual([true, false]);
  });
});
