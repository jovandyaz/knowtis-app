import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_BODY_BYTES,
  MODELS_DEV_URL,
  ModelsDevHttpClient,
} from './models-dev.client';

const CLAUDE_SONNET_5 = {
  id: 'claude-sonnet-5',
  name: 'Claude Sonnet 5',
  description:
    'Everyday Claude agent model for coding, planning, browsing, and general work',
  family: 'claude-sonnet',
  attachment: true,
  reasoning: true,
  reasoning_options: [
    { type: 'toggle' },
    { type: 'effort', values: ['low', 'medium', 'high', 'xhigh', 'max'] },
  ],
  tool_call: true,
  structured_output: true,
  temperature: false,
  knowledge: '2026-01-31',
  release_date: '2026-06-29',
  last_updated: '2026-06-30',
  modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
  open_weights: false,
  limit: { context: 1000000, output: 128000 },
  cost: { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
};

const CLAUDE_HAIKU_45 = {
  id: 'claude-haiku-4-5',
  name: 'Claude Haiku 4.5 (latest)',
  family: 'claude-haiku',
  reasoning: true,
  reasoning_options: [{ type: 'budget_tokens', min: 1024 }],
  tool_call: true,
  structured_output: true,
  release_date: '2025-10-15',
  modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
  open_weights: false,
  limit: { context: 200000, output: 64000 },
  cost: { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 },
  canonical_model_id: 'anthropic/claude-haiku-4-5',
};

const GPT_54 = {
  id: 'gpt-5.4',
  name: 'GPT-5.4',
  family: 'gpt',
  reasoning: true,
  reasoning_options: [
    { type: 'effort', values: ['none', 'low', 'medium', 'high', 'xhigh'] },
  ],
  tool_call: true,
  structured_output: true,
  release_date: '2026-03-05',
  modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
  open_weights: false,
  limit: { context: 1050000, input: 922000, output: 128000 },
  cost: {
    input: 2.5,
    output: 15,
    cache_read: 0.25,
    tiers: [
      {
        input: 5,
        output: 22.5,
        cache_read: 0.5,
        tier: { type: 'context', size: 272000 },
      },
    ],
    context_over_200k: { input: 5, output: 22.5, cache_read: 0.5 },
  },
};

const GPT_54_MINI = {
  id: 'gpt-5.4-mini',
  name: 'GPT-5.4 mini',
  family: 'gpt-mini',
  reasoning: true,
  reasoning_options: [
    { type: 'effort', values: ['none', 'low', 'medium', 'high', 'xhigh'] },
  ],
  tool_call: true,
  structured_output: true,
  release_date: '2026-03-17',
  modalities: { input: ['text', 'image'], output: ['text'] },
  open_weights: false,
  limit: { context: 400000, input: 272000, output: 128000 },
  cost: { input: 0.75, output: 4.5, cache_read: 0.075 },
};

const NEGATIVELY_PRICED_GPT = {
  ...GPT_54_MINI,
  id: 'gpt-5.4-broken',
  cost: { input: -1, output: 4.5 },
};

const GEMINI_25_FLASH = {
  id: 'gemini-2.5-flash',
  name: 'Gemini 2.5 Flash',
  family: 'gemini-flash',
  reasoning: true,
  reasoning_options: [
    { type: 'toggle' },
    { type: 'budget_tokens', min: 0, max: 24576 },
  ],
  tool_call: true,
  structured_output: true,
  release_date: '2025-06-17',
  modalities: {
    input: ['text', 'image', 'audio', 'video', 'pdf'],
    output: ['text'],
  },
  open_weights: false,
  limit: { context: 1048576, output: 65536 },
  cost: { input: 0.3, output: 2.5, cache_read: 0.03, input_audio: 1 },
  canonical_model_id: 'google/gemini-2.5-flash',
};

const GEMINI_35_FLASH = {
  id: 'gemini-3.5-flash',
  name: 'Gemini 3.5 Flash',
  family: 'gemini-flash',
  reasoning: true,
  reasoning_options: [
    { type: 'effort', values: ['minimal', 'low', 'medium', 'high'] },
  ],
  tool_call: true,
  structured_output: true,
  release_date: '2026-05-19',
  modalities: {
    input: ['text', 'image', 'video', 'audio', 'pdf'],
    output: ['text'],
  },
  open_weights: false,
  limit: { context: 1048576, output: 65536 },
  cost: { input: 1.5, output: 9, cache_read: 0.15, input_audio: 1.5 },
};

const OPENROUTER_KIMI_K3 = {
  id: 'moonshotai/kimi-k3',
  name: 'Kimi K3',
  family: 'kimi-k3',
  reasoning: true,
  reasoning_options: [
    { type: 'toggle' },
    { type: 'effort', values: ['low', 'high', 'max'] },
  ],
  tool_call: true,
  structured_output: true,
  release_date: '2026-07-16',
  modalities: { input: ['text', 'image', 'video'], output: ['text'] },
  open_weights: true,
  limit: { context: 1048576, output: 943718 },
  cost: { input: 0.99, output: 13, cache_read: 0.8 },
  canonical_model_id: 'moonshotai/kimi-k3',
};

const OPENROUTER_DEEPSEEK_V32 = {
  id: 'deepseek/deepseek-v3.2',
  name: 'DeepSeek V3.2',
  family: 'deepseek',
  reasoning: true,
  reasoning_options: [{ type: 'toggle' }],
  tool_call: true,
  structured_output: true,
  release_date: '2025-12-01',
  modalities: { input: ['text'], output: ['text'] },
  open_weights: true,
  limit: { context: 163840, output: 65536 },
  cost: { input: 0.28, output: 0.42, cache_read: 0.028 },
  canonical_model_id: 'deepseek/deepseek-v3.2',
};

function section(id: string, models: Record<string, unknown>) {
  return { id, name: id, models };
}

const PAYLOAD = {
  anthropic: section('anthropic', {
    [CLAUDE_SONNET_5.id]: CLAUDE_SONNET_5,
    [CLAUDE_HAIKU_45.id]: CLAUDE_HAIKU_45,
  }),
  openai: section('openai', {
    [GPT_54.id]: GPT_54,
    [GPT_54_MINI.id]: GPT_54_MINI,
    [NEGATIVELY_PRICED_GPT.id]: NEGATIVELY_PRICED_GPT,
  }),
  google: section('google', {
    [GEMINI_25_FLASH.id]: GEMINI_25_FLASH,
    [GEMINI_35_FLASH.id]: GEMINI_35_FLASH,
  }),
  openrouter: section('openrouter', {
    [OPENROUTER_KIMI_K3.id]: OPENROUTER_KIMI_K3,
    [OPENROUTER_DEEPSEEK_V32.id]: OPENROUTER_DEEPSEEK_V32,
  }),
  deepseek: section('deepseek', {
    'deepseek-chat': { id: 'deepseek-chat', name: 'DeepSeek Chat' },
  }),
};

function okResponse(body: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers });
}

function rawResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

function oversizedResponse(headers: HeadersInit = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_BODY_BYTES + 1));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers });
}

describe('ModelsDevHttpClient', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it('should normalize the indexed providers, collect the OpenRouter enrichment and count the bad entry', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(PAYLOAD));

    const catalog = await new ModelsDevHttpClient().fetchCatalog();

    expect(catalog.models.map((model) => model.id)).toEqual([
      'anthropic:claude-sonnet-5',
      'anthropic:claude-haiku-4-5',
      'openai:gpt-5.4',
      'openai:gpt-5.4-mini',
      'google:gemini-2.5-flash',
      'google:gemini-3.5-flash',
    ]);
    expect([...catalog.openRouterEnrichment.keys()]).toEqual([
      'moonshotai/kimi-k3',
      'deepseek/deepseek-v3.2',
    ]);
    expect(catalog.discarded).toEqual(['openai:gpt-5.4-broken']);
  });

  it('should tag each row with the provider section it came from', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(PAYLOAD));

    const { models } = await new ModelsDevHttpClient().fetchCatalog();

    expect(models.map((model) => [model.provider, model.source])).toEqual([
      ['anthropic', 'models_dev'],
      ['anthropic', 'models_dev'],
      ['openai', 'models_dev'],
      ['openai', 'models_dev'],
      ['google', 'models_dev'],
      ['google', 'models_dev'],
    ]);
    expect(models[0]).toMatchObject({
      name: 'Claude Sonnet 5',
      family: 'claude-sonnet',
      inputCostPerToken: 0.000002,
      outputCostPerToken: 0.00001,
      canonical: 'anthropic/claude-sonnet-5',
    });
  });

  it('should key the enrichment by the OpenRouter id without a prefix', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(PAYLOAD));

    const { openRouterEnrichment } =
      await new ModelsDevHttpClient().fetchCatalog();

    expect(openRouterEnrichment.get('moonshotai/kimi-k3')).toEqual({
      family: 'kimi-k3',
      canonical: 'moonshotai/kimi-k3',
      openWeights: true,
      status: 'active',
    });
  });

  it('should fetch the models.dev catalog with a timeout', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(PAYLOAD));

    await new ModelsDevHttpClient().fetchCatalog();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(MODELS_DEV_URL);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('should log the discarded entries', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(PAYLOAD));

    await new ModelsDevHttpClient().fetchCatalog();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.model_index.models_dev_discarded',
        count: 1,
        models: ['openai:gpt-5.4-broken'],
      })
    );
  });

  it('should mark an entry whose id cannot be read as unparseable', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        anthropic: section('anthropic', {
          broken: 'not an object',
          [CLAUDE_SONNET_5.id]: CLAUDE_SONNET_5,
        }),
      })
    );

    const { models, discarded } =
      await new ModelsDevHttpClient().fetchCatalog();

    expect(models.map((model) => model.id)).toEqual([
      'anthropic:claude-sonnet-5',
    ]);
    expect(discarded).toEqual(['anthropic:<unparseable>']);
  });

  it('should skip an enrichment it cannot read without counting it as discarded', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        openrouter: section('openrouter', {
          'broken/model': { id: 'broken/model' },
          [OPENROUTER_KIMI_K3.id]: OPENROUTER_KIMI_K3,
        }),
      })
    );

    const { openRouterEnrichment, discarded } =
      await new ModelsDevHttpClient().fetchCatalog();

    expect([...openRouterEnrichment.keys()]).toEqual(['moonshotai/kimi-k3']);
    expect(discarded).toEqual([]);
  });

  it('should yield no rows for a provider section models.dev omits', async () => {
    const { anthropic, openai, openrouter } = PAYLOAD;
    fetchMock.mockResolvedValueOnce(
      okResponse({ anthropic, openai, openrouter })
    );

    const { models } = await new ModelsDevHttpClient().fetchCatalog();

    expect(models.some((model) => model.provider === 'google')).toBe(false);
    expect(models).toHaveLength(4);
  });

  it('should ignore a model key that would rewrite the map prototype', async () => {
    fetchMock.mockResolvedValueOnce(
      rawResponse(
        `{"anthropic": {"id": "anthropic", "models": {"__proto__": ${JSON.stringify(
          CLAUDE_HAIKU_45
        )}, "claude-sonnet-5": ${JSON.stringify(CLAUDE_SONNET_5)}}}}`
      )
    );

    const { models, discarded } =
      await new ModelsDevHttpClient().fetchCatalog();

    expect(models.map((model) => model.id)).toEqual([
      'anthropic:claude-sonnet-5',
    ]);
    expect(discarded).toEqual([]);
  });

  it('should not read a provider section through the payload prototype', async () => {
    fetchMock.mockResolvedValueOnce(
      rawResponse(
        `{"__proto__": {"anthropic": {"id": "anthropic", "models": {"claude-sonnet-5": ${JSON.stringify(
          CLAUDE_SONNET_5
        )}}}}}`
      )
    );

    const { models } = await new ModelsDevHttpClient().fetchCatalog();

    expect(models).toEqual([]);
  });

  it('should throw when upstream answers with a non-2xx status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));

    await expect(new ModelsDevHttpClient().fetchCatalog()).rejects.toThrow(
      /503/
    );
  });

  it('should reject a payload that declares a size over the cap', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(PAYLOAD, { 'content-length': String(MAX_BODY_BYTES + 1) })
    );

    await expect(new ModelsDevHttpClient().fetchCatalog()).rejects.toThrow(
      /exceeds/
    );
  });

  it('should reject a payload that outgrows the cap while it streams', async () => {
    fetchMock.mockResolvedValueOnce(
      oversizedResponse({ 'content-length': '2' })
    );

    await expect(new ModelsDevHttpClient().fetchCatalog()).rejects.toThrow(
      /exceeds/
    );
  });

  it('should throw when the payload is not an object of providers', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(['not', 'providers']));

    await expect(new ModelsDevHttpClient().fetchCatalog()).rejects.toThrow();
  });

  it('should throw when an indexed provider section has no models map', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({ ...PAYLOAD, openai: { id: 'openai', models: 'gone' } })
    );

    await expect(new ModelsDevHttpClient().fetchCatalog()).rejects.toThrow();
  });

  it('should throw when the body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(rawResponse('<html>maintenance</html>'));

    await expect(new ModelsDevHttpClient().fetchCatalog()).rejects.toThrow();
  });
});
