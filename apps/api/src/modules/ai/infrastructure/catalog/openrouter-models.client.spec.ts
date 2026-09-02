import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_MODEL_PAGES,
  OpenRouterModelsHttpClient,
} from './openrouter-models.client';

const DEEPSEEK_V32 = {
  id: 'deepseek/deepseek-v3.2',
  canonical_slug: 'deepseek/deepseek-v3.2-exp',
  name: 'DeepSeek: DeepSeek V3.2',
  created: 1764594642,
  description: 'DeepSeek-V3.2 is an experimental large language model...',
  context_length: 163840,
  architecture: {
    modality: 'text->text',
    input_modalities: ['text'],
    output_modalities: ['text'],
    tokenizer: 'DeepSeek',
  },
  pricing: {
    prompt: '0.000000269',
    completion: '0.0000004',
    input_cache_read: '0.0000001345',
  },
  top_provider: {
    context_length: 163840,
    max_completion_tokens: 65536,
    is_moderated: false,
  },
  per_request_limits: null,
  expiration_date: null,
  benchmarks: {
    design_arena: [{ arena: 'agents', category: 'webapps', elo: 1240 }],
    artificial_analysis: {
      intelligence_index: 47.6,
      coding_index: 51.2,
      agentic_index: 39.4,
    },
  },
};

const KIMI_K3 = {
  id: 'moonshotai/kimi-k3',
  name: 'MoonshotAI: Kimi K3',
  created: 1784215858,
  description: 'Kimi K3 is a 2.8T parameter open-weight multimodal model...',
  context_length: 1048576,
  architecture: {
    modality: 'text+image->text',
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
  },
  pricing: { prompt: '0.000003', completion: '0.000015' },
  top_provider: { context_length: 1048576, max_completion_tokens: null },
  expiration_date: null,
  benchmarks: { artificial_analysis: { intelligence_index: 59.7 } },
};

const GLM_45_EXPIRING = {
  id: 'z-ai/glm-4.5',
  name: 'Z.ai: GLM 4.5',
  created: 1753471347,
  description: 'GLM-4.5 is our latest foundation model...',
  context_length: 131072,
  architecture: { output_modalities: ['text'] },
  pricing: { prompt: '0.0000006', completion: '0.0000022' },
  top_provider: { max_completion_tokens: 98304 },
  expiration_date: '2026-12-31',
};

const GLM_5V_TURBO_SENTINEL = {
  ...GLM_45_EXPIRING,
  id: 'z-ai/glm-5v-turbo',
  name: 'Z.ai: GLM 5V Turbo',
  expiration_date: '2098-12-31',
};

const OPENROUTER_AUTO_VARIABLE_PRICE = {
  id: 'openrouter/auto',
  name: 'Auto Router',
  created: 1699401600,
  description: 'Routes your request to the best available model.',
  context_length: 2000000,
  architecture: { output_modalities: ['text'] },
  pricing: { prompt: '-1', completion: '-1' },
  top_provider: { max_completion_tokens: null },
  expiration_date: null,
};

const BLANK_PRICED_MODEL = {
  id: 'mystery/unpriced',
  name: 'Mystery: Unpriced',
  created: 1780000000,
  description: 'A model upstream has not priced yet.',
  context_length: 131072,
  architecture: { output_modalities: ['text'] },
  pricing: { prompt: '', completion: '' },
};

const WHITESPACE_PRICED_MODEL = {
  ...BLANK_PRICED_MODEL,
  id: 'mystery/blank-priced',
  pricing: { prompt: '   ', completion: '   ' },
};

const MINIMAL_MODEL = {
  id: 'qwen/qwen3.8-max',
  name: 'Qwen: Qwen3.8 Max',
  created: 1780000000,
  description: 'Qwen3.8 Max is the flagship model of the Qwen series.',
  context_length: 262144,
  architecture: { output_modalities: ['text'] },
  pricing: { prompt: '0.0000012', completion: '0.000006' },
};

function page(models: unknown[], next: string | null = null) {
  return { data: models, total_count: models.length, links: { next } };
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => 'upstream failure',
  } as Response;
}

describe('OpenRouterModelsHttpClient', () => {
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

  it('should map the upstream payload onto domain models', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(page([DEEPSEEK_V32])));

    const [model] = (await new OpenRouterModelsHttpClient().fetchModels())
      .models;

    expect(model).toEqual({
      id: 'deepseek/deepseek-v3.2',
      name: 'DeepSeek: DeepSeek V3.2',
      description: DEEPSEEK_V32.description,
      createdAt: new Date('2025-12-01T13:10:42.000Z'),
      contextLength: 163840,
      maxCompletionTokens: 65536,
      promptCostPerToken: 0.000000269,
      completionCostPerToken: 0.0000004,
      expirationDate: null,
      intelligenceIndex: 47.6,
      outputModalities: ['text'],
      reasoning: null,
    });
  });

  it('should capture declared reasoning efforts, dropping unknown values', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(
        page([
          {
            ...DEEPSEEK_V32,
            reasoning: {
              supported_efforts: ['low', 'high', 'turbo'],
              default_effort: 'high',
              mandatory: true,
            },
          },
        ])
      )
    );

    const [model] = (await new OpenRouterModelsHttpClient().fetchModels())
      .models;

    expect(model.reasoning).toEqual({
      levels: ['low', 'high'],
      mandatory: true,
    });
  });

  it('should yield null reasoning when upstream omits the object', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(page([DEEPSEEK_V32])));

    const [model] = (await new OpenRouterModelsHttpClient().fetchModels())
      .models;

    expect(model.reasoning).toBeNull();
  });

  it('should read pricing strings as numbers', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(page([DEEPSEEK_V32])));

    const [model] = (await new OpenRouterModelsHttpClient().fetchModels())
      .models;

    expect(model.promptCostPerToken).toBeTypeOf('number');
    expect(model.completionCostPerToken).toBeTypeOf('number');
  });

  it('should read max completion tokens from top_provider and null it when absent', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(page([GLM_45_EXPIRING, KIMI_K3, MINIMAL_MODEL]))
    );

    const { models } = await new OpenRouterModelsHttpClient().fetchModels();

    expect(models.map((model) => model.maxCompletionTokens)).toEqual([
      98304,
      null,
      null,
    ]);
    expect(models.map((model) => model.intelligenceIndex)).toEqual([
      null,
      59.7,
      null,
    ]);
  });

  it('should keep a real expiration date and drop the far-future sentinel', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(page([GLM_45_EXPIRING, GLM_5V_TURBO_SENTINEL]))
    );

    const { models } = await new OpenRouterModelsHttpClient().fetchModels();

    expect(models[0].expirationDate).toEqual(
      new Date('2026-12-31T00:00:00.000Z')
    );
    expect(models[1].expirationDate).toBeNull();
  });

  it('should throw when upstream answers with a non-2xx status', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500));

    await expect(
      new OpenRouterModelsHttpClient().fetchModels()
    ).rejects.toThrow(/500/);
  });

  it('should discard a model it cannot parse and log it, keeping the rest', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(
        page([
          OPENROUTER_AUTO_VARIABLE_PRICE,
          { id: 'broken/model' },
          DEEPSEEK_V32,
        ])
      )
    );

    const { models, discarded } =
      await new OpenRouterModelsHttpClient().fetchModels();

    expect(models.map((model) => model.id)).toEqual(['deepseek/deepseek-v3.2']);
    expect(discarded).toEqual(['openrouter/auto', 'broken/model']);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 2,
        models: ['openrouter/auto', 'broken/model'],
      })
    );
  });

  it('should discard a model whose price is blank instead of pricing it at zero', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(page([BLANK_PRICED_MODEL, DEEPSEEK_V32]))
    );

    const { models } = await new OpenRouterModelsHttpClient().fetchModels();

    expect(models.map((model) => model.id)).toEqual(['deepseek/deepseek-v3.2']);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ models: ['mystery/unpriced'] })
    );
  });

  it('should discard a model whose price is only whitespace', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(page([WHITESPACE_PRICED_MODEL, DEEPSEEK_V32]))
    );

    const { models } = await new OpenRouterModelsHttpClient().fetchModels();

    expect(models.map((model) => model.id)).toEqual(['deepseek/deepseek-v3.2']);
  });

  it('should follow links.next until it is null and concatenate the pages', async () => {
    fetchMock
      .mockResolvedValueOnce(
        okResponse(page([DEEPSEEK_V32], '/api/v1/models?offset=1&limit=1'))
      )
      .mockResolvedValueOnce(okResponse(page([KIMI_K3])));

    const { models } = await new OpenRouterModelsHttpClient().fetchModels();

    expect(models.map((model) => model.id)).toEqual([
      'deepseek/deepseek-v3.2',
      'moonshotai/kimi-k3',
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://openrouter.ai/api/v1/models'
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://openrouter.ai/api/v1/models?offset=1&limit=1'
    );
  });

  it('should not follow a next link that points off the OpenRouter origin', async () => {
    fetchMock.mockResolvedValue(
      okResponse(page([DEEPSEEK_V32], 'https://evil.example.com/api/v1/models'))
    );

    const { models, complete } =
      await new OpenRouterModelsHttpClient().fetchModels();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(models).toHaveLength(1);
    expect(complete).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.catalog.upstream_pagination_rejected',
      })
    );
  });

  it('should stop paginating on a next link that is not a valid url', async () => {
    fetchMock.mockResolvedValue(okResponse(page([DEEPSEEK_V32], 'http://')));

    const { models, complete } =
      await new OpenRouterModelsHttpClient().fetchModels();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(models).toHaveLength(1);
    expect(complete).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.catalog.upstream_pagination_rejected',
      })
    );
  });

  it('should stop paginating on a next link that points back to a fetched page', async () => {
    fetchMock
      .mockResolvedValueOnce(
        okResponse(page([DEEPSEEK_V32], '/api/v1/models?offset=1&limit=1'))
      )
      .mockResolvedValueOnce(
        okResponse(page([KIMI_K3], '/api/v1/models?offset=1&limit=1'))
      );

    const { models, complete } =
      await new OpenRouterModelsHttpClient().fetchModels();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(models).toHaveLength(2);
    expect(complete).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.catalog.upstream_pagination_cycle',
      })
    );
    expect(warn).not.toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.catalog.upstream_pagination_truncated',
      })
    );
  });

  it('should stop at the page cap when upstream never stops paginating', async () => {
    // Each page advances the offset: a repeated url would trip cycle detection
    // instead, which is a different upstream fault.
    let offset = 0;
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        okResponse(
          page(
            [DEEPSEEK_V32],
            `https://openrouter.ai/api/v1/models?offset=${++offset}`
          )
        )
      )
    );

    const { models, complete } =
      await new OpenRouterModelsHttpClient().fetchModels();

    expect(fetchMock).toHaveBeenCalledTimes(MAX_MODEL_PAGES);
    expect(models).toHaveLength(MAX_MODEL_PAGES);
    expect(complete).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.catalog.upstream_pagination_truncated',
      })
    );
  });
});
