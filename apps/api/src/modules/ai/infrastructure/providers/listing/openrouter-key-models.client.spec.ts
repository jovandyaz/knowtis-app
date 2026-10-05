import { HttpStatus, Logger } from '@nestjs/common';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

import type { ProviderListing } from '../../../domain/ports/provider-models.port';
import {
  listingCall,
  stubListingFetch,
  stubListingFetchThenHang,
  stubListingFetchThenThrow,
  type ListingFetch,
} from '../../../testing/stub-listing-fetch';
import { HttpProviderModelsLister } from './http-provider-models.lister';
import {
  LISTING_TIMEOUT_MESSAGE,
  LISTING_TIMEOUT_MS,
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

function list(
  keyAccepted: () => void = () => undefined
): Promise<ProviderListing> {
  return new OpenRouterKeyModelsClient().list(
    API_KEY,
    new AbortController().signal,
    keyAccepted
  );
}

function listBounded(): Promise<ProviderListing> {
  return new HttpProviderModelsLister().list('openrouter', API_KEY);
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
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

    await new OpenRouterKeyModelsClient().list(
      API_KEY,
      signal,
      () => undefined
    );

    for (const index of [0, 1]) {
      const { url, init } = listingCall(fetchMock, index);
      expect(init.headers).toEqual({ Authorization: `Bearer ${API_KEY}` });
      expect(init.signal).toBe(signal);
      expect(url.toString()).not.toContain(API_KEY);
    }
  });

  it.each([
    {
      status: HttpStatus.UNAUTHORIZED,
      body: OPENROUTER_INVALID_KEY_BODY,
      error: `HTTP 401: ${OPENROUTER_INVALID_KEY_BODY.error.message}`,
    },
    { status: HttpStatus.FORBIDDEN, body: null, error: 'HTTP 403' },
  ])(
    'reads a $status from /key as rejected and never lists',
    async ({ status, body, error }) => {
      const fetchMock = stubListingFetch({ body, status });
      const keyAccepted = vi.fn();

      await expect(list(keyAccepted)).resolves.toEqual({
        kind: 'rejected',
        error,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(keyAccepted).not.toHaveBeenCalled();
    }
  );

  it.each([
    { name: 'no flags', data: {} },
    {
      name: 'null flags',
      data: { is_management_key: null, is_provisioning_key: null },
    },
  ])('accepts a key with $name and lists it', async ({ data }) => {
    const fetchMock = stubListingFetch(
      { body: { data } },
      { body: OPENROUTER_USER_MODELS }
    );
    const keyAccepted = vi.fn();

    const listing = await list(keyAccepted);

    expect(listing.kind).toBe('listed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(keyAccepted).toHaveBeenCalled();
  });

  it.each(['is_management_key', 'is_provisioning_key'])(
    'rejects a management key without listing: %s',
    async (flag) => {
      const fetchMock = stubListingFetch({
        body: { data: { ...OPENROUTER_KEY.data, [flag]: true } },
      });
      const keyAccepted = vi.fn();

      await expect(list(keyAccepted)).resolves.toEqual({
        kind: 'rejected',
        error: 'A management key cannot call models',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(keyAccepted).not.toHaveBeenCalled();
    }
  );

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
      const keyAccepted = vi.fn();

      await expect(list(keyAccepted)).resolves.toEqual(MALFORMED_LISTING);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(keyAccepted).not.toHaveBeenCalled();
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

      await expect(listBounded()).resolves.toEqual(UNKNOWN_LISTING);
    }
  );

  it('keeps a valid key unknown when the user listing request throws', async () => {
    stubListingFetchThenThrow({ body: OPENROUTER_KEY });

    await expect(listBounded()).resolves.toEqual(UNKNOWN_LISTING);
  });

  it('lists null when the user models read hangs after the key was accepted', async () => {
    vi.useFakeTimers();
    const fetchMock = stubListingFetchThenHang({ body: OPENROUTER_KEY });

    const pending = listBounded();
    await vi.advanceTimersByTimeAsync(LISTING_TIMEOUT_MS);

    await expect(pending).resolves.toEqual(UNKNOWN_LISTING);
    expect(readsOf(fetchMock)).toEqual([KEY_URL, USER_MODELS_URL]);
    expect(listingCall(fetchMock, 1).init.signal?.aborted).toBe(true);
  });

  it('answers unavailable when /key hangs past the bound', async () => {
    vi.useFakeTimers();
    stubListingFetchThenHang();

    const pending = listBounded();
    await vi.advanceTimersByTimeAsync(LISTING_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({
      kind: 'unavailable',
      error: LISTING_TIMEOUT_MESSAGE,
    });
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

    await expect(listBounded()).resolves.toEqual(UNKNOWN_LISTING);
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
