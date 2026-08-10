import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LITELLM_PRICES_URL,
  LiteLlmPricesHttpClient,
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

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
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
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);

    await expect(new LiteLlmPricesHttpClient().fetchPrices()).rejects.toThrow(
      /503/
    );
  });

  it('should throw when the payload is not a price map', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(['not', 'a', 'map']));

    await expect(new LiteLlmPricesHttpClient().fetchPrices()).rejects.toThrow();
  });
});
