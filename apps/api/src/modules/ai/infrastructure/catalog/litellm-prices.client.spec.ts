import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LITELLM_PRICES_URL,
  LiteLlmPricesHttpClient,
  MAX_PRICE_PAYLOAD_BYTES,
} from './litellm-prices.client';

const PAYLOAD = {
  'claude-sonnet-5': {
    litellm_provider: 'anthropic',
    mode: 'chat',
    input_cost_per_token: 0.000003,
    output_cost_per_token: 0.00001,
  },
  'gpt-5.4': {
    litellm_provider: 'openai',
    mode: 'chat',
    output_cost_per_token: 0.000015,
    deprecation_date: '2027-01-15',
  },
};

function okResponse(body: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers });
}

function oversizedResponse(headers: HeadersInit = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_PRICE_PAYLOAD_BYTES + 1));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers });
}

describe('LiteLlmPricesHttpClient', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('should read only the fields the curated watch compares', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(PAYLOAD));

    const prices = await new LiteLlmPricesHttpClient().fetchPrices();

    expect(prices).toEqual({
      'claude-sonnet-5': { output_cost_per_token: 0.00001 },
      'gpt-5.4': {
        output_cost_per_token: 0.000015,
        deprecation_date: '2027-01-15',
      },
    });
  });

  it('should fetch the same source the vendored snapshot is generated from', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(PAYLOAD));

    await new LiteLlmPricesHttpClient().fetchPrices();

    expect(fetchMock.mock.calls[0][0]).toBe(LITELLM_PRICES_URL);
  });

  it('should drop an entry it cannot read and keep the rest', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        ...PAYLOAD,
        'broken/model': 'not an object',
        'string-priced/model': { output_cost_per_token: '0.00001' },
      })
    );

    const prices = await new LiteLlmPricesHttpClient().fetchPrices();

    expect(Object.keys(prices)).toEqual(['claude-sonnet-5', 'gpt-5.4']);
  });

  it('should ignore an upstream key that would rewrite the map prototype', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(
        JSON.parse(
          '{"__proto__": {"output_cost_per_token": 0.00001}, "gpt-5.4": {"output_cost_per_token": 0.000015}}'
        )
      )
    );

    const prices = await new LiteLlmPricesHttpClient().fetchPrices();

    expect(Object.keys(prices)).toEqual(['gpt-5.4']);
    expect(Object.getPrototypeOf(prices)).toBe(Object.prototype);
  });

  it('should throw when upstream answers with a non-2xx status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));

    await expect(new LiteLlmPricesHttpClient().fetchPrices()).rejects.toThrow(
      /503/
    );
  });

  it('should reject a payload that declares a size over the cap', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(PAYLOAD, {
        'content-length': String(MAX_PRICE_PAYLOAD_BYTES + 1),
      })
    );

    await expect(new LiteLlmPricesHttpClient().fetchPrices()).rejects.toThrow(
      /exceeds/
    );
  });

  it('should reject a payload that outgrows the cap while it streams', async () => {
    fetchMock.mockResolvedValueOnce(
      oversizedResponse({ 'content-length': '2' })
    );

    await expect(new LiteLlmPricesHttpClient().fetchPrices()).rejects.toThrow(
      /exceeds/
    );
  });

  it('should throw when the payload is not a price map', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(['not', 'a', 'map']));

    await expect(new LiteLlmPricesHttpClient().fetchPrices()).rejects.toThrow();
  });
});
