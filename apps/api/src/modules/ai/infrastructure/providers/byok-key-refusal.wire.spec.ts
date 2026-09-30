import { streamText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockConfig } from '../../testing/create-mock-config';
import { classifyByokKeyFailure } from './byok-key-failure';
import { probeProviderKey } from './provider-probe';
import { ProviderRegistryFactory } from './provider-registry.factory';

const OPENAI_MODEL = 'openai:gpt-5.6-terra';
const USER_KEY = 'sk-user-local-not-a-real-key';
const SDK_RETRIES = 3;
const TOO_MANY_REQUESTS = 429;

function openaiAnswering(code: string) {
  return vi.fn(async () =>
    Response.json(
      { error: { message: 'refused', type: code, param: null, code } },
      { status: TOO_MANY_REQUESTS, headers: { 'retry-after-ms': '0' } }
    )
  );
}

async function streamedError(factory: ProviderRegistryFactory) {
  const result = streamText({
    model: factory.languageModel(OPENAI_MODEL, USER_KEY),
    prompt: 'ping',
    maxRetries: SDK_RETRIES,
    onError: () => undefined,
  });
  for await (const part of result.stream) {
    if (part.type === 'error') {
      return part.error;
    }
  }
  return undefined;
}

describe('a caller-keyed OpenAI model on the wire', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the provider once for a key out of quota', async () => {
    const fetch = openaiAnswering('insufficient_quota');
    vi.stubGlobal('fetch', fetch);

    const error = await streamedError(
      new ProviderRegistryFactory(createMockConfig())
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(classifyByokKeyFailure(error, 'openai')).toBe('credit');
  });

  it('still retries a rate limit', async () => {
    const fetch = openaiAnswering('rate_limit_exceeded');
    vi.stubGlobal('fetch', fetch);

    await streamedError(new ProviderRegistryFactory(createMockConfig()));

    expect(fetch).toHaveBeenCalledTimes(SDK_RETRIES + 1);
  });

  it('rejects a probed key out of quota after one request', async () => {
    const fetch = openaiAnswering('insufficient_quota');
    vi.stubGlobal('fetch', fetch);

    const probe = await probeProviderKey(
      new ProviderRegistryFactory(createMockConfig()),
      'openai',
      USER_KEY
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(probe).toMatchObject({ valid: false, reason: 'rejected' });
  });
});
