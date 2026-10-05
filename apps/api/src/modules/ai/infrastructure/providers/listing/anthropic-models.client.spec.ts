import { HttpStatus } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProviderListing } from '../../../domain/ports/provider-models.port';
import {
  listingCall,
  stubListingFetch,
} from '../../../testing/stub-listing-fetch';
import {
  ANTHROPIC_API_VERSION,
  AnthropicModelsClient,
} from './anthropic-models.client';
import {
  MALFORMED_LISTING,
  MAX_LISTING_PAGES,
  UNKNOWN_LISTING,
} from './listing-http';
import {
  ANTHROPIC_INVALID_KEY_BODY,
  ANTHROPIC_MODELS_PAGE_1,
  ANTHROPIC_MODELS_PAGE_2,
} from './provider-listing.fixtures';

const API_KEY = 'sk-ant-test-listing-0001';
const ANTHROPIC_DATED_HAIKU = /^claude-haiku-4-5-\d{8}$/;
const RECORDED_IDS = [
  ...ANTHROPIC_MODELS_PAGE_1.data,
  ...ANTHROPIC_MODELS_PAGE_2.data,
].map((model) => model.id);

function list(): Promise<ProviderListing> {
  return new AnthropicModelsClient().list(
    API_KEY,
    new AbortController().signal
  );
}

function listedIds(listing: ProviderListing): readonly string[] {
  if (listing.kind !== 'listed' || listing.modelIds === null) {
    throw new Error(`expected a full listing, got ${JSON.stringify(listing)}`);
  }
  return listing.modelIds;
}

describe('AnthropicModelsClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows has_more across pages and lists every id', async () => {
    const fetchMock = stubListingFetch(
      { body: ANTHROPIC_MODELS_PAGE_1 },
      { body: ANTHROPIC_MODELS_PAGE_2 }
    );

    await expect(list()).resolves.toEqual({
      kind: 'listed',
      modelIds: RECORDED_IDS,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = listingCall(fetchMock, 0).url;
    const second = listingCall(fetchMock, 1).url;
    expect(`${first.origin}${first.pathname}`).toBe(
      'https://api.anthropic.com/v1/models'
    );
    expect(first.searchParams.get('limit')).toBe('1000');
    expect(first.searchParams.has('after_id')).toBe(false);
    expect(second.searchParams.get('after_id')).toBe(
      ANTHROPIC_MODELS_PAGE_1.last_id
    );
  });

  it("keeps Anthropic's dated ids as listed", async () => {
    stubListingFetch(
      { body: ANTHROPIC_MODELS_PAGE_1 },
      { body: ANTHROPIC_MODELS_PAGE_2 }
    );
    const dated = RECORDED_IDS.find((id) => ANTHROPIC_DATED_HAIKU.test(id));
    if (dated === undefined) {
      throw new Error('the recorded pages list no dated Haiku snapshot');
    }

    const ids = listedIds(await list());

    expect(ids).toContain(dated);
    expect(ids).not.toContain(dated.replace(/-\d{8}$/, ''));
  });

  it('sends the key in x-api-key with the API version', async () => {
    const fetchMock = stubListingFetch({ body: ANTHROPIC_MODELS_PAGE_2 });
    const signal = new AbortController().signal;

    await new AnthropicModelsClient().list(API_KEY, signal);

    const { url, init } = listingCall(fetchMock, 0);
    expect(init.headers).toEqual({
      'x-api-key': API_KEY,
      'anthropic-version': ANTHROPIC_API_VERSION,
    });
    expect(init.signal).toBe(signal);
    expect(url.toString()).not.toContain(API_KEY);
  });

  it('reads a 401 as rejected', async () => {
    stubListingFetch({
      body: ANTHROPIC_INVALID_KEY_BODY,
      status: HttpStatus.UNAUTHORIZED,
    });

    await expect(list()).resolves.toEqual({
      kind: 'rejected',
      error: `HTTP 401: ${ANTHROPIC_INVALID_KEY_BODY.error.message}`,
    });
  });

  it.each([
    { later: 'fails', reply: { body: null, status: HttpStatus.BAD_GATEWAY } },
    { later: 'is malformed', reply: { body: { data: 'none' } } },
  ])('lists null when a later page $later', async ({ reply }) => {
    stubListingFetch({ body: ANTHROPIC_MODELS_PAGE_1 }, reply);

    await expect(list()).resolves.toEqual(UNKNOWN_LISTING);
  });

  it('lists null when last_id repeats', async () => {
    const fetchMock = stubListingFetch({ body: ANTHROPIC_MODELS_PAGE_1 });

    await expect(list()).resolves.toEqual(UNKNOWN_LISTING);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lists null at the page cap', async () => {
    let page = 0;
    const fetchMock = stubListingFetch();
    fetchMock.mockImplementation(async () => {
      page += 1;
      const id = `claude-page-${page}`;
      return new Response(
        JSON.stringify({ data: [{ id }], has_more: true, last_id: id })
      );
    });

    await expect(list()).resolves.toEqual(UNKNOWN_LISTING);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_LISTING_PAGES);
  });

  it.each([
    { shape: 'a body that is not a page', body: { models: [] } },
    { shape: 'no body', body: null },
    {
      shape: 'more pages without a cursor',
      body: { data: [], has_more: true },
    },
  ])(
    'answers unavailable for a malformed first page: $shape',
    async ({ body }) => {
      stubListingFetch({ body });

      await expect(list()).resolves.toEqual(MALFORMED_LISTING);
    }
  );

  it('skips an entry it cannot read', async () => {
    stubListingFetch({
      body: {
        data: [{ id: 'claude-opus-5' }, { id: 7 }, 'claude-sonnet-5'],
        has_more: false,
        last_id: 'claude-sonnet-5',
      },
    });

    await expect(list()).resolves.toEqual({
      kind: 'listed',
      modelIds: ['claude-opus-5'],
    });
  });
});
