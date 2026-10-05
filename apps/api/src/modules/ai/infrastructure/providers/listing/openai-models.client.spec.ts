import { HttpStatus } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProviderListing } from '../../../domain/ports/provider-models.port';
import {
  listingCall,
  stubListingFetch,
} from '../../../testing/stub-listing-fetch';
import { MALFORMED_LISTING } from './listing-http';
import { OpenAIModelsClient } from './openai-models.client';
import {
  OPENAI_INVALID_KEY_BODY,
  OPENAI_MODELS,
} from './provider-listing.fixtures';

const API_KEY = 'sk-proj-test-listing-0001';
const OPENAI_RATE_LIMIT_BODY = {
  error: {
    message: 'Rate limit reached for requests',
    type: 'requests',
    code: 'rate_limit_exceeded',
  },
};

function list(): Promise<ProviderListing> {
  return new OpenAIModelsClient().list(API_KEY, new AbortController().signal);
}

describe('OpenAIModelsClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists every id of the recorded page', async () => {
    const fetchMock = stubListingFetch({ body: OPENAI_MODELS });

    await expect(list()).resolves.toEqual({
      kind: 'listed',
      modelIds: OPENAI_MODELS.data.map((model) => model.id),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = listingCall(fetchMock, 0);
    expect(url.toString()).toBe('https://api.openai.com/v1/models');
    expect(init.headers).toEqual({ Authorization: `Bearer ${API_KEY}` });
  });

  it.each([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN])(
    'reads %i as rejected',
    async (status) => {
      stubListingFetch({ body: OPENAI_INVALID_KEY_BODY, status });

      await expect(list()).resolves.toEqual({
        kind: 'rejected',
        error: `HTTP ${status}: ${OPENAI_INVALID_KEY_BODY.error.message}`,
      });
    }
  );

  it.each([
    {
      status: HttpStatus.TOO_MANY_REQUESTS,
      body: OPENAI_RATE_LIMIT_BODY,
      error: `HTTP 429: ${OPENAI_RATE_LIMIT_BODY.error.message}`,
    },
    { status: HttpStatus.INTERNAL_SERVER_ERROR, body: null, error: 'HTTP 500' },
  ])('reads a $status as unavailable', async ({ status, body, error }) => {
    stubListingFetch({ body, status });

    await expect(list()).resolves.toEqual({ kind: 'unavailable', error });
  });

  it('answers unavailable for a malformed page', async () => {
    stubListingFetch({ body: { object: 'list' } });

    await expect(list()).resolves.toEqual(MALFORMED_LISTING);
  });
});
