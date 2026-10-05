import { HttpStatus } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProviderListing } from '../../../domain/ports/provider-models.port';
import {
  listingCall,
  stubListingFetch,
} from '../../../testing/stub-listing-fetch';
import {
  GOOGLE_MODEL_PREFIX,
  GoogleModelsClient,
} from './google-models.client';
import { MALFORMED_LISTING, UNKNOWN_LISTING } from './listing-http';
import {
  GOOGLE_INVALID_KEY_BODY,
  GOOGLE_MODELS_PAGE_1,
  GOOGLE_MODELS_PAGE_2,
} from './provider-listing.fixtures';

const API_KEY = 'AIza-test-listing-0001';
const GOOGLE_BAD_REQUEST_BODY = {
  error: {
    message: 'Request contains an invalid argument.',
    details: [{ reason: 'BAD_REQUEST' }],
  },
};

function list(): Promise<ProviderListing> {
  return new GoogleModelsClient().list(API_KEY, new AbortController().signal);
}

describe('GoogleModelsClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips the models/ prefix and follows nextPageToken', async () => {
    const fetchMock = stubListingFetch(
      { body: GOOGLE_MODELS_PAGE_1 },
      { body: GOOGLE_MODELS_PAGE_2 }
    );

    await expect(list()).resolves.toEqual({
      kind: 'listed',
      modelIds: [
        ...GOOGLE_MODELS_PAGE_1.models,
        ...GOOGLE_MODELS_PAGE_2.models,
      ].map((model) => model.name.slice(GOOGLE_MODEL_PREFIX.length)),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = listingCall(fetchMock, 0).url;
    const second = listingCall(fetchMock, 1).url;
    expect(`${first.origin}${first.pathname}`).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models'
    );
    expect(first.searchParams.get('pageSize')).toBe('1000');
    expect(first.searchParams.has('pageToken')).toBe(false);
    expect(second.searchParams.get('pageToken')).toBe(
      GOOGLE_MODELS_PAGE_1.nextPageToken
    );
  });

  it('keeps only names under models/', async () => {
    stubListingFetch({
      body: {
        models: [
          { name: 'models/gemini-2.5-flash' },
          { name: 'tunedModels/support-bot' },
          { name: 'models/' },
          { displayName: 'Unnamed' },
        ],
      },
    });

    await expect(list()).resolves.toEqual({
      kind: 'listed',
      modelIds: ['gemini-2.5-flash'],
    });
  });

  it('lists null for an empty answer', async () => {
    stubListingFetch({ body: {} });

    await expect(list()).resolves.toEqual(UNKNOWN_LISTING);
  });

  it('answers unavailable for a first page that is not JSON', async () => {
    stubListingFetch({ body: null });

    await expect(list()).resolves.toEqual(MALFORMED_LISTING);
  });

  it('never puts the key in the URL', async () => {
    const fetchMock = stubListingFetch(
      { body: GOOGLE_MODELS_PAGE_1 },
      { body: GOOGLE_MODELS_PAGE_2 }
    );

    await list();

    for (const index of [0, 1]) {
      const { url, init } = listingCall(fetchMock, index);
      expect(url.searchParams.has('key')).toBe(false);
      expect(url.search).not.toContain('key=');
      expect(url.toString()).not.toContain(API_KEY);
      expect(init.headers).toEqual({ 'x-goog-api-key': API_KEY });
    }
  });

  it('reads a 400 API_KEY_INVALID as rejected', async () => {
    stubListingFetch({
      body: GOOGLE_INVALID_KEY_BODY,
      status: HttpStatus.BAD_REQUEST,
    });

    await expect(list()).resolves.toEqual({
      kind: 'rejected',
      error: `HTTP 400: ${GOOGLE_INVALID_KEY_BODY.error.message}`,
    });
  });

  it.each([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN])(
    'reads %i as rejected',
    async (status) => {
      stubListingFetch({ body: null, status });

      await expect(list()).resolves.toEqual({
        kind: 'rejected',
        error: `HTTP ${status}`,
      });
    }
  );

  it('reads another 400 as unavailable', async () => {
    stubListingFetch({
      body: GOOGLE_BAD_REQUEST_BODY,
      status: HttpStatus.BAD_REQUEST,
    });

    await expect(list()).resolves.toEqual({
      kind: 'unavailable',
      error: `HTTP 400: ${GOOGLE_BAD_REQUEST_BODY.error.message}`,
    });
  });

  it('lists null when the page token repeats', async () => {
    const fetchMock = stubListingFetch({ body: GOOGLE_MODELS_PAGE_1 });

    await expect(list()).resolves.toEqual(UNKNOWN_LISTING);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
