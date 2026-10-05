import { HttpStatus } from '@nestjs/common';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { ProviderListing } from '../../../domain/ports/provider-models.port';
import {
  listingCall,
  stubListingFetch,
  type ListingFetch,
} from '../../../testing/stub-listing-fetch';
import {
  MALFORMED_LISTING,
  MAX_LISTING_PAGES,
  UNKNOWN_LISTING,
} from './listing-http';
import { OpenRouterKeyModelsClient } from './openrouter-key-models.client';
import {
  OPENROUTER_INVALID_KEY_BODY,
  OPENROUTER_KEY,
  OPENROUTER_USER_MODELS,
} from './provider-listing.fixtures';

const API_KEY = 'sk-or-v1-test-listing-0001';
const KEY_URL = 'https://openrouter.ai/api/v1/key';
const USER_MODELS_URL = 'https://openrouter.ai/api/v1/models/user';
const SECOND_PAGE_PATH = '/api/v1/models/user?offset=6';
const RECORDED_IDS = OPENROUTER_USER_MODELS.data.map((model) => model.id);

function list(): Promise<ProviderListing> {
  return new OpenRouterKeyModelsClient().list(
    API_KEY,
    new AbortController().signal
  );
}

function userModelsPage(ids: readonly string[], next: string | null) {
  return { data: ids.map((id) => ({ id })), links: { next } };
}

function readsOf(fetchMock: Mock<ListingFetch>): string[] {
  return fetchMock.mock.calls.map((_, index) =>
    listingCall(fetchMock, index).url.toString()
  );
}

describe('OpenRouterKeyModelsClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks the key before listing the user's models", async () => {
    const fetchMock = stubListingFetch(
      { body: OPENROUTER_KEY },
      { body: OPENROUTER_USER_MODELS }
    );

    await list();

    expect(readsOf(fetchMock)).toEqual([KEY_URL, USER_MODELS_URL]);
  });

  it('sends the key as a bearer token on both reads, never in a URL', async () => {
    const fetchMock = stubListingFetch(
      { body: OPENROUTER_KEY },
      { body: OPENROUTER_USER_MODELS }
    );
    const signal = new AbortController().signal;

    await new OpenRouterKeyModelsClient().list(API_KEY, signal);

    for (const index of [0, 1]) {
      const { url, init } = listingCall(fetchMock, index);
      expect(init.headers).toEqual({ Authorization: `Bearer ${API_KEY}` });
      expect(init.signal).toBe(signal);
      expect(url.toString()).not.toContain(API_KEY);
    }
  });

  it('reads a 401 from /key as rejected and never lists', async () => {
    const fetchMock = stubListingFetch({
      body: OPENROUTER_INVALID_KEY_BODY,
      status: HttpStatus.UNAUTHORIZED,
    });

    await expect(list()).resolves.toEqual({
      kind: 'rejected',
      error: `HTTP 401: ${OPENROUTER_INVALID_KEY_BODY.error.message}`,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('answers unavailable when /key fails for another reason', async () => {
    const fetchMock = stubListingFetch({
      body: null,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });

    await expect(list()).resolves.toEqual({
      kind: 'unavailable',
      error: 'HTTP 500',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { shape: 'no data', body: { error: null } },
    { shape: 'data that is not an object', body: { data: 'none' } },
    { shape: 'no body', body: null },
  ])(
    'answers unavailable for a malformed /key body: $shape',
    async ({ body }) => {
      const fetchMock = stubListingFetch({ body });

      await expect(list()).resolves.toEqual(MALFORMED_LISTING);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it("lists the account's models from /models/user", async () => {
    const fetchMock = stubListingFetch(
      { body: OPENROUTER_KEY },
      { body: OPENROUTER_USER_MODELS }
    );

    await expect(list()).resolves.toEqual({
      kind: 'listed',
      modelIds: RECORDED_IDS,
    });
    expect(listingCall(fetchMock, 1).url.search).toBe('');
  });

  it.each([
    { failure: '403', reply: { body: null, status: HttpStatus.FORBIDDEN } },
    {
      failure: '500',
      reply: { body: null, status: HttpStatus.INTERNAL_SERVER_ERROR },
    },
    { failure: 'a malformed page', reply: { body: { data: 'none' } } },
    { failure: 'an empty list', reply: { body: userModelsPage([], null) } },
  ])(
    'keeps a valid key whose user listing fails unknown: $failure',
    async ({ reply }) => {
      stubListingFetch({ body: OPENROUTER_KEY }, reply);

      await expect(list()).resolves.toEqual(UNKNOWN_LISTING);
    }
  );

  it('keeps a valid key unknown when the user listing request throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<ListingFetch>()
        .mockResolvedValueOnce(new Response(JSON.stringify(OPENROUTER_KEY)))
        .mockRejectedValueOnce(new TypeError('fetch failed'))
    );

    await expect(list()).resolves.toEqual(UNKNOWN_LISTING);
  });

  it('follows a same-origin next link', async () => {
    const fetchMock = stubListingFetch(
      { body: OPENROUTER_KEY },
      { body: userModelsPage(['openai/gpt-5-mini'], SECOND_PAGE_PATH) },
      { body: userModelsPage(['moonshotai/kimi-k3'], null) }
    );

    await expect(list()).resolves.toEqual({
      kind: 'listed',
      modelIds: ['openai/gpt-5-mini', 'moonshotai/kimi-k3'],
    });
    expect(listingCall(fetchMock, 2).url.toString()).toBe(
      `https://openrouter.ai${SECOND_PAGE_PATH}`
    );
  });

  it('lists null for a foreign next link', async () => {
    const fetchMock = stubListingFetch(
      { body: OPENROUTER_KEY },
      {
        body: userModelsPage(
          RECORDED_IDS,
          'https://evil.example/api/v1/models/user?offset=6'
        ),
      }
    );

    await expect(list()).resolves.toEqual(UNKNOWN_LISTING);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lists null when the next link repeats', async () => {
    const fetchMock = stubListingFetch(
      { body: OPENROUTER_KEY },
      { body: userModelsPage(RECORDED_IDS, SECOND_PAGE_PATH) }
    );

    await expect(list()).resolves.toEqual(UNKNOWN_LISTING);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('lists null at the page cap', async () => {
    let page = 0;
    const fetchMock = stubListingFetch();
    fetchMock.mockImplementation(async (url) => {
      if (String(url) === KEY_URL) {
        return new Response(JSON.stringify(OPENROUTER_KEY));
      }
      page += 1;
      return new Response(
        JSON.stringify(
          userModelsPage(
            [`vendor/model-${page}`],
            `/api/v1/models/user?offset=${page}`
          )
        )
      );
    });

    await expect(list()).resolves.toEqual(UNKNOWN_LISTING);
    expect(fetchMock).toHaveBeenCalledTimes(1 + MAX_LISTING_PAGES);
  });
});
