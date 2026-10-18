import { describe, expect, it } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { isGone } from './api-errors';

describe('isGone', () => {
  it.each([
    ['a 404 from the API', new ApiClientError('gone', 404), true],
    ['another API failure', new ApiClientError('boom', 500), false],
    ['a plain error', new Error('404'), false],
    ['nothing', undefined, false],
  ])('reads %s as gone: %s', (_label, error, gone) => {
    expect(isGone(error)).toBe(gone);
  });
});
