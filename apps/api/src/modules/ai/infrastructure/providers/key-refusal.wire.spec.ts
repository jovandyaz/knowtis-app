import { generateText, streamText, type LanguageModel } from 'ai';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

import { executeWithChain } from '@knowtis/ai-gateway';

import { AiProvidersController } from '../../ai-providers.controller';
import { createMockConfig } from '../../testing/create-mock-config';
import {
  createSnapshotIndex,
  SNAPSHOT_DATE,
} from '../../testing/snapshot-index';
import { classifyByokKeyFailure } from './byok-key-failure';
import { probeProviderKey } from './provider-probe';
import { ProviderRegistryFactory } from './provider-registry.factory';

const OPENAI_MODEL = 'openai:gpt-5.6-terra';
const ANTHROPIC_MODEL = 'anthropic:claude-haiku-4-5';
const OPENAI_HOST = 'api.openai.com';
const ANTHROPIC_HOST = 'api.anthropic.com';
const USER_KEY = 'sk-user-local-not-a-real-key';
const PLATFORM_KEY = 'sk-platform-local-not-a-real-key';
const SDK_RETRIES = 3;
const TOO_MANY_REQUESTS = 429;

const ANTHROPIC_ANSWER = {
  id: 'msg_local',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-4-5',
  content: [{ type: 'text', text: 'pong' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
};

const silentLogger = { warn: () => undefined, error: () => undefined };

function openaiRefusal(code: string) {
  return Response.json(
    { error: { message: 'refused', type: code, param: null, code } },
    { status: TOO_MANY_REQUESTS, headers: { 'retry-after-ms': '0' } }
  );
}

function openaiAnswering(code: string) {
  return vi.fn(async () => openaiRefusal(code));
}

function callsTo(fetch: Mock, host: string): number {
  return fetch.mock.calls.filter(([url]) => String(url).includes(host)).length;
}

async function streamedError(model: LanguageModel) {
  const result = streamText({
    model,
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

async function platformFactory() {
  const factory = new ProviderRegistryFactory(
    createMockConfig({ OPENAI_API_KEY: PLATFORM_KEY })
  );
  await factory.onModuleInit();
  return factory;
}

describe('a caller-keyed OpenAI model on the wire', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the provider once for a key out of quota', async () => {
    const fetch = openaiAnswering('insufficient_quota');
    vi.stubGlobal('fetch', fetch);

    const error = await streamedError(
      new ProviderRegistryFactory(createMockConfig()).languageModel(
        OPENAI_MODEL,
        USER_KEY
      )
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(classifyByokKeyFailure(error, 'openai')).toBe('credit');
  });

  it('still retries a rate limit', async () => {
    const fetch = openaiAnswering('rate_limit_exceeded');
    vi.stubGlobal('fetch', fetch);

    await streamedError(
      new ProviderRegistryFactory(createMockConfig()).languageModel(
        OPENAI_MODEL,
        USER_KEY
      )
    );

    expect(fetch).toHaveBeenCalledTimes(SDK_RETRIES + 1);
  });

  it('rejects a probed key out of quota after one request', async () => {
    const fetch = openaiAnswering('insufficient_quota');
    vi.stubGlobal('fetch', fetch);

    const probe = await probeProviderKey(
      new ProviderRegistryFactory(createMockConfig()),
      'openai',
      USER_KEY,
      'openai:gpt-6-luna'
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(probe).toMatchObject({ valid: false, reason: 'rejected' });
  });
});

describe('a platform-keyed OpenAI model on the wire', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SNAPSHOT_DATE);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('asks the provider once for a server key out of quota', async () => {
    const fetch = openaiAnswering('insufficient_quota');
    vi.stubGlobal('fetch', fetch);
    const factory = await platformFactory();

    await streamedError(factory.languageModel(OPENAI_MODEL));

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fails over to the next candidate after one request to a server key out of quota', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes(ANTHROPIC_HOST)
        ? Response.json(ANTHROPIC_ANSWER)
        : openaiRefusal('insufficient_quota')
    );
    vi.stubGlobal('fetch', fetch);
    const factory = await platformFactory();

    const text = await executeWithChain(
      async (model) =>
        (
          await generateText({
            model: factory.languageModel(model),
            prompt: 'ping',
            maxRetries: SDK_RETRIES,
          })
        ).text,
      { candidates: [OPENAI_MODEL, ANTHROPIC_MODEL], logger: silentLogger }
    );

    expect(text).toBe('pong');
    expect(callsTo(fetch, OPENAI_HOST)).toBe(1);
    expect(callsTo(fetch, ANTHROPIC_HOST)).toBe(1);
  });

  it('still retries a rate limit on a server key', async () => {
    const fetch = openaiAnswering('rate_limit_exceeded');
    vi.stubGlobal('fetch', fetch);
    const factory = await platformFactory();

    await streamedError(factory.languageModel(OPENAI_MODEL));

    expect(fetch).toHaveBeenCalledTimes(SDK_RETRIES + 1);
  });

  it('tests a server key out of quota as rejected after one request', async () => {
    const fetch = openaiAnswering('insufficient_quota');
    vi.stubGlobal('fetch', fetch);
    const controller = new AiProvidersController(
      {} as never,
      await platformFactory(),
      createSnapshotIndex()
    );

    const result = await controller.test({ provider: 'openai' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, reason: 'rejected' });
  });
});
