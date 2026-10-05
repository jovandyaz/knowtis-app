import { HttpStatus } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MODEL_ID_MAX_LENGTH } from '@knowtis/shared-types';

import {
  listingCall,
  type ListingFetch,
} from '../../../testing/stub-listing-fetch';
import {
  boundedListing,
  getListingJson,
  listedOf,
  LISTING_ERROR_MAX_LENGTH,
  LISTING_TIMEOUT_MS,
  refusalOf,
  sameOriginNext,
  UNKNOWN_LISTING,
} from './listing-http';
import * as recordedFixtures from './provider-listing.fixtures';

const API_KEY = 'sk-test-listing-key-0001';
const LISTING_URL = new URL('https://api.example.test/v1/models');
const KEY_SHAPED = /\bsk-|AIza|Bearer/;

function readListing(signal: AbortSignal) {
  return getListingJson(LISTING_URL, {}, signal).then((response) =>
    response.ok ? UNKNOWN_LISTING : refusalOf(response)
  );
}

describe('listing-http', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps an empty listing unknown', () => {
    expect(listedOf([])).toEqual(UNKNOWN_LISTING);
    expect(listedOf([''])).toEqual(UNKNOWN_LISTING);
  });

  it('drops ids longer than MODEL_ID_MAX_LENGTH and de-duplicates', () => {
    const longest = 'm'.repeat(MODEL_ID_MAX_LENGTH);

    expect(listedOf(['a', longest, `${longest}x`, 'a', ''])).toEqual({
      kind: 'listed',
      modelIds: ['a', longest],
    });
  });

  it('answers unavailable when the bound passes', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: URL, _init: RequestInit) => new Promise<Response>(() => undefined)
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = boundedListing(API_KEY, readListing);
    await vi.advanceTimersByTimeAsync(LISTING_TIMEOUT_MS - 1);
    await expect(
      Promise.race([pending, Promise.resolve('still pending')])
    ).resolves.toBe('still pending');
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({
      kind: 'unavailable',
      error: 'The listing timed out',
    });
    expect(fetchMock.mock.calls[0]?.[1].signal?.aborted).toBe(true);
  });

  it('redacts the key from a thrown error', async () => {
    const listing = await boundedListing(API_KEY, async () => {
      throw new Error(`connect failed for ${API_KEY} at the edge`);
    });

    expect(listing).toEqual({
      kind: 'unavailable',
      error: 'connect failed for [redacted] at the edge',
    });
  });

  it('redacts the key from a refusal the provider echoed it in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { message: `Bad key ${API_KEY}` } }),
            { status: HttpStatus.UNAUTHORIZED }
          )
      )
    );

    await expect(boundedListing(API_KEY, readListing)).resolves.toEqual({
      kind: 'rejected',
      error: 'HTTP 401: Bad key [redacted]',
    });
  });

  it('truncates a long provider message', async () => {
    const message = 'x'.repeat(LISTING_ERROR_MAX_LENGTH * 2);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message } }), {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
          })
      )
    );

    const listing = await boundedListing(API_KEY, readListing);

    expect(listing).toEqual({
      kind: 'unavailable',
      error: `HTTP 500: ${message}`.slice(0, LISTING_ERROR_MAX_LENGTH),
    });
  });

  it('reports only the status when the refusal body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html>Bad gateway</html>', {
            status: HttpStatus.BAD_GATEWAY,
          })
      )
    );

    await expect(boundedListing(API_KEY, readListing)).resolves.toEqual({
      kind: 'unavailable',
      error: 'HTTP 502',
    });
  });

  it('refuses a redirect, which answers unavailable without the key', async () => {
    const fetchMock = vi.fn<ListingFetch>(async (_url, init) => {
      if (init.redirect === 'error') {
        throw new TypeError(`unexpected redirect while sending ${API_KEY}`);
      }
      return new Response(JSON.stringify({ data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(boundedListing(API_KEY, readListing)).resolves.toEqual({
      kind: 'unavailable',
      error: 'unexpected redirect while sending [redacted]',
    });
    expect(listingCall(fetchMock, 0).init.redirect).toBe('error');
  });

  it('resolves a same-origin next link and rejects a foreign one', () => {
    const base = 'https://openrouter.ai/api/v1/models/user';
    const second = 'https://openrouter.ai/api/v1/models/user?offset=2';

    expect(sameOriginNext('/api/v1/models/user?offset=2', base)).toBe(second);
    expect(sameOriginNext(second, base)).toBe(second);
    expect(sameOriginNext('https://evil.example/api/v1/models', base)).toBe(
      null
    );
    expect(sameOriginNext('http://[::1', base)).toBe(null);
    expect(sameOriginNext('', base)).toBe(null);
    expect(sameOriginNext(null, base)).toBe(null);
    expect(sameOriginNext(undefined, base)).toBe(null);
  });

  it('the recorded fixtures carry no key material', () => {
    const fixtures = Object.entries(recordedFixtures);

    expect(fixtures.length).toBeGreaterThan(0);
    for (const [name, fixture] of fixtures) {
      expect({ name, leaks: KEY_SHAPED.test(JSON.stringify(fixture)) }).toEqual(
        { name, leaks: false }
      );
    }
  });
});
