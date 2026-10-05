import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { AI_PROVIDERS, type AIProvider } from '@knowtis/shared-types';

import type { ProviderListing } from '../../../domain/ports/provider-models.port';
import { AnthropicModelsClient } from './anthropic-models.client';
import { GoogleModelsClient } from './google-models.client';
import { HttpProviderModelsLister } from './http-provider-models.lister';
import { LISTING_TIMEOUT_MS, type ProviderModelsClient } from './listing-http';
import { OpenAIModelsClient } from './openai-models.client';
import { OpenRouterKeyModelsClient } from './openrouter-key-models.client';

const API_KEY = 'sk-test-secret-123';

function listedBy(provider: AIProvider): ProviderListing {
  return { kind: 'listed', modelIds: [`${provider}-model`] };
}

function spyOnEveryClient(): Readonly<
  Record<AIProvider, MockInstance<ProviderModelsClient['list']>>
> {
  return {
    anthropic: vi
      .spyOn(AnthropicModelsClient.prototype, 'list')
      .mockResolvedValue(listedBy('anthropic')),
    openai: vi
      .spyOn(OpenAIModelsClient.prototype, 'list')
      .mockResolvedValue(listedBy('openai')),
    google: vi
      .spyOn(GoogleModelsClient.prototype, 'list')
      .mockResolvedValue(listedBy('google')),
    openrouter: vi
      .spyOn(OpenRouterKeyModelsClient.prototype, 'list')
      .mockResolvedValue(listedBy('openrouter')),
  };
}

describe('HttpProviderModelsLister', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(AI_PROVIDERS)(
    "dispatches to the provider's client: %s",
    async (provider) => {
      const spies = spyOnEveryClient();

      const listing = await new HttpProviderModelsLister().list(
        provider,
        API_KEY
      );

      expect(listing).toEqual(listedBy(provider));
      expect(spies[provider]).toHaveBeenCalledWith(
        API_KEY,
        expect.any(AbortSignal)
      );
      const others = AI_PROVIDERS.filter((other) => other !== provider);
      expect(
        others.filter((other) => spies[other].mock.calls.length > 0)
      ).toEqual([]);
    }
  );

  it('answers unavailable when a client hangs past the bound', async () => {
    vi.useFakeTimers();
    const hung = vi
      .spyOn(AnthropicModelsClient.prototype, 'list')
      .mockReturnValue(new Promise<ProviderListing>(() => undefined));

    const pending = new HttpProviderModelsLister().list('anthropic', API_KEY);
    await vi.advanceTimersByTimeAsync(LISTING_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({
      kind: 'unavailable',
      error: 'The listing timed out',
    });
    expect(hung.mock.calls[0]?.[1].aborted).toBe(true);
  });

  it.each<{ failure: string; outcome: () => Promise<ProviderListing> }>([
    {
      failure: 'a rejection',
      outcome: async () => ({ kind: 'rejected', error: `bad key ${API_KEY}` }),
    },
    {
      failure: 'an unavailable listing',
      outcome: async () => ({
        kind: 'unavailable',
        error: `upstream refused ${API_KEY} twice: ${API_KEY}`,
      }),
    },
    {
      failure: 'a thrown error',
      outcome: async () => {
        throw new Error(`connect failed with ${API_KEY}`);
      },
    },
  ])('redacts the key from every failure: $failure', async ({ outcome }) => {
    vi.spyOn(OpenAIModelsClient.prototype, 'list').mockImplementation(outcome);

    const listing = await new HttpProviderModelsLister().list(
      'openai',
      API_KEY
    );

    if (listing.kind === 'listed') {
      throw new Error(`expected a failure, got ${JSON.stringify(listing)}`);
    }
    expect(listing.error).toContain('[redacted]');
    expect(listing.error).not.toContain(API_KEY);
  });
});
