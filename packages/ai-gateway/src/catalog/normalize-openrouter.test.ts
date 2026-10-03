import { describe, expect, it } from 'vitest';

import { enrichmentFromModelsDev, fromModelsDev } from './normalize-models-dev';
import {
  fromOpenRouter,
  type OpenRouterModelInput,
} from './normalize-openrouter';

const DEEPSEEK_V4_PRO: OpenRouterModelInput = {
  id: 'deepseek/deepseek-v4-pro-0813',
  name: 'DeepSeek: DeepSeek V4 Pro 0813',
  createdAt: new Date('2026-08-12T15:42:44Z'),
  contextLength: 1048576,
  maxCompletionTokens: 943718,
  promptCostPerToken: Number('0.00000022'),
  completionCostPerToken: Number('0.0000042'),
  cacheReadCostPerToken: Number('0.00000014'),
  cacheWriteCostPerToken: null,
  expirationDate: null,
  inputModalities: ['text'],
  outputModalities: ['text'],
  supportedParameters: [
    'frequency_penalty',
    'include_reasoning',
    'logit_bias',
    'logprobs',
    'max_tokens',
    'min_p',
    'presence_penalty',
    'reasoning',
    'reasoning_effort',
    'repetition_penalty',
    'response_format',
    'seed',
    'stop',
    'structured_outputs',
    'temperature',
    'tool_choice',
    'tools',
    'top_k',
    'top_logprobs',
    'top_p',
  ],
  reasoning: { levels: ['max', 'high', 'low'], mandatory: false },
};

const MODELS_DEV_DEEPSEEK_V4_PRO = {
  id: 'deepseek/deepseek-v4-pro-0813',
  name: 'DeepSeek V4 Pro 0813',
  description:
    'DeepSeek V4 Pro snapshot with million-token context and support for thinking and non-thinking modes',
  family: 'deepseek-thinking',
  attachment: false,
  reasoning: true,
  reasoning_options: [
    { type: 'toggle' },
    { type: 'effort', values: ['low', 'high', 'max'] },
  ],
  tool_call: true,
  structured_output: true,
  temperature: true,
  release_date: '2026-08-12',
  last_updated: '2026-08-22',
  modalities: { input: ['text'], output: ['text'] },
  open_weights: true,
  limit: { context: 1048576, output: 943718 },
  cost: { input: 0.22, output: 4.2, cache_read: 0.14 },
  canonical_model_id: 'deepseek/deepseek-v4-pro-0813',
};

const GLM_5_3: OpenRouterModelInput = {
  id: 'z-ai/glm-5.3',
  name: 'Z.ai: GLM 5.3',
  createdAt: new Date('2026-08-18T20:57:35Z'),
  contextLength: 1048576,
  maxCompletionTokens: 131072,
  promptCostPerToken: Number('0.0000014'),
  completionCostPerToken: Number('0.0000044'),
  cacheReadCostPerToken: Number('0.00000014'),
  cacheWriteCostPerToken: null,
  expirationDate: null,
  inputModalities: ['text'],
  outputModalities: ['text'],
  supportedParameters: [
    'frequency_penalty',
    'include_reasoning',
    'logit_bias',
    'logprobs',
    'max_tokens',
    'min_p',
    'parallel_tool_calls',
    'presence_penalty',
    'reasoning',
    'reasoning_effort',
    'repetition_penalty',
    'response_format',
    'seed',
    'stop',
    'structured_outputs',
    'temperature',
    'tool_choice',
    'tools',
    'top_k',
    'top_logprobs',
    'top_p',
  ],
  reasoning: { levels: ['max', 'high', 'low'], mandatory: true },
};

const MODELS_DEV_GLM_5_3 = {
  id: 'z-ai/glm-5.3',
  name: 'GLM-5.3',
  description:
    'Flagship GLM model for hybrid reasoning, coding, and agentic engineering',
  family: 'glm',
  attachment: false,
  reasoning: true,
  reasoning_options: [{ type: 'effort', values: ['low', 'high', 'max'] }],
  tool_call: true,
  structured_output: true,
  temperature: true,
  release_date: '2026-08-14',
  last_updated: '2026-08-14',
  modalities: { input: ['text'], output: ['text'] },
  open_weights: true,
  limit: { context: 1048576, output: 131072 },
  cost: { input: 1.4, output: 4.4, cache_read: 0.14 },
  canonical_model_id: 'zhipuai/glm-5.3',
};

const SEED_2_0_CODE: OpenRouterModelInput = {
  id: 'bytedance-seed/seed-2.0-code',
  name: 'ByteDance Seed: Seed-2.0-Code',
  createdAt: new Date('2026-08-12T16:05:01Z'),
  contextLength: 262144,
  maxCompletionTokens: 131072,
  promptCostPerToken: Number('0.0000005'),
  completionCostPerToken: Number('0.000003'),
  cacheReadCostPerToken: null,
  cacheWriteCostPerToken: null,
  expirationDate: new Date('2026-11-11'),
  inputModalities: ['text', 'image', 'video'],
  outputModalities: ['text'],
  supportedParameters: [
    'frequency_penalty',
    'include_reasoning',
    'max_tokens',
    'reasoning',
    'reasoning_effort',
    'response_format',
    'stop',
    'structured_outputs',
    'temperature',
    'tool_choice',
    'tools',
    'top_p',
  ],
  reasoning: { levels: ['high', 'medium', 'low'], mandatory: false },
};

const GPT_5_6_LUNA: OpenRouterModelInput = {
  id: 'openai/gpt-5.6-luna',
  name: 'OpenAI: GPT-5.6 Luna',
  createdAt: new Date('2026-07-09T09:54:24Z'),
  contextLength: 1050000,
  maxCompletionTokens: 128000,
  promptCostPerToken: Number('0.0000002'),
  completionCostPerToken: Number('0.0000012'),
  cacheReadCostPerToken: Number('0.00000002'),
  cacheWriteCostPerToken: Number('0.00000025'),
  expirationDate: null,
  inputModalities: ['file', 'image', 'text'],
  outputModalities: ['text'],
  supportedParameters: [
    'include_reasoning',
    'max_completion_tokens',
    'max_tokens',
    'reasoning',
    'reasoning_effort',
    'response_format',
    'seed',
    'structured_outputs',
    'tool_choice',
    'tools',
    'verbosity',
  ],
  reasoning: {
    levels: ['max', 'xhigh', 'high', 'medium', 'low', 'none'],
    mandatory: false,
  },
};

const MODELS_DEV_GPT_5_6_LUNA_ON_OPENROUTER = {
  id: 'openai/gpt-5.6-luna',
  name: 'GPT-5.6 Luna',
  description:
    'GPT model for general reasoning, writing, coding, and tool-assisted tasks',
  family: 'gpt-luna',
  attachment: true,
  reasoning: true,
  reasoning_options: [
    {
      type: 'effort',
      values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    },
  ],
  tool_call: true,
  structured_output: true,
  temperature: false,
  knowledge: '2026-02-16',
  release_date: '2026-07-09',
  last_updated: '2026-07-09',
  modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
  open_weights: false,
  limit: { context: 1050000, input: 922000, output: 128000 },
  cost: {
    input: 0.2,
    output: 1.2,
    cache_read: 0.02,
    cache_write: 0.25,
    tiers: [
      {
        input: 0.4,
        output: 1.8,
        cache_read: 0.04,
        cache_write: 0.5,
        tier: { type: 'context', size: 272000 },
      },
    ],
    context_over_200k: {
      input: 0.4,
      output: 1.8,
      cache_read: 0.04,
      cache_write: 0.5,
    },
  },
  canonical_model_id: 'openai/gpt-5.6-luna',
};

const MODELS_DEV_GPT_5_6_LUNA_DIRECT = {
  id: 'gpt-5.6-luna',
  name: 'GPT-5.6 Luna',
  description: 'Cost-efficient GPT-5.6 model for fast, high-volume workloads',
  family: 'gpt-luna',
  attachment: true,
  reasoning: true,
  reasoning_options: [
    {
      type: 'effort',
      values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    },
  ],
  tool_call: true,
  structured_output: true,
  temperature: false,
  knowledge: '2026-02-16',
  release_date: '2026-07-09',
  last_updated: '2026-07-09',
  modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
  open_weights: false,
  limit: { context: 1050000, input: 922000, output: 128000 },
  experimental: {
    modes: {
      fast: {
        cost: { input: 0.4, output: 2.4, cache_read: 0.04, cache_write: 0.5 },
        provider: { body: { service_tier: 'priority' } },
      },
      pro: { provider: { body: { reasoning: { mode: 'pro' } } } },
    },
  },
  cost: {
    input: 0.2,
    output: 1.2,
    cache_read: 0.02,
    cache_write: 0.25,
    tiers: [
      {
        input: 0.4,
        output: 1.8,
        cache_read: 0.04,
        cache_write: 0.5,
        tier: { type: 'context', size: 272000 },
      },
    ],
    context_over_200k: {
      input: 0.4,
      output: 1.8,
      cache_read: 0.04,
      cache_write: 0.5,
    },
  },
  canonical_model_id: 'openai/gpt-5.6-luna',
};

describe('fromOpenRouter', () => {
  it('normalizes an OpenRouter model enriched by its models.dev entry', () => {
    expect(
      fromOpenRouter(
        DEEPSEEK_V4_PRO,
        enrichmentFromModelsDev(MODELS_DEV_DEEPSEEK_V4_PRO)
      )
    ).toEqual({
      id: 'openrouter:deepseek/deepseek-v4-pro-0813',
      provider: 'openrouter',
      name: 'DeepSeek: DeepSeek V4 Pro 0813',
      family: 'deepseek-thinking',
      releasedAt: '2026-08-12',
      status: 'active',
      toolCall: true,
      structuredOutput: true,
      inputModalities: ['text'],
      outputModalities: ['text'],
      inputCostPerToken: 2.2e-7,
      outputCostPerToken: 4.2e-6,
      cacheReadCostPerToken: 1.4e-7,
      cacheWriteCostPerToken: null,
      maxInputTokens: 1048576,
      maxOutputTokens: 943718,
      reasoning: { levels: ['max', 'high', 'low'], mandatory: false },
      canonical: 'deepseek/deepseek-v4-pro-0813',
      openWeights: true,
      retiresAt: null,
      source: 'openrouter',
    });
  });

  it('takes the canonical id from the enrichment and normalizes it', () => {
    expect(
      fromOpenRouter(GLM_5_3, enrichmentFromModelsDev(MODELS_DEV_GLM_5_3))
        .canonical
    ).toBe('zhipuai/glm-5-3');
  });

  it('gives the direct and OpenRouter routes of one model the same canonical key', () => {
    const direct = fromModelsDev('openai', MODELS_DEV_GPT_5_6_LUNA_DIRECT);
    const routed = fromOpenRouter(
      GPT_5_6_LUNA,
      enrichmentFromModelsDev(MODELS_DEV_GPT_5_6_LUNA_ON_OPENROUTER)
    );

    expect(direct?.canonical).toBe('openai/gpt-5-6-luna');
    expect(routed.canonical).toBe(direct?.canonical);
  });

  it('derives the canonical id and leaves models.dev facts unknown without enrichment', () => {
    expect(fromOpenRouter(GLM_5_3, null)).toMatchObject({
      family: null,
      canonical: 'z-ai/glm-5-3',
      openWeights: null,
      status: 'active',
    });
  });

  it('takes the lifecycle status from the enrichment', () => {
    const enrichment = enrichmentFromModelsDev({
      ...MODELS_DEV_GLM_5_3,
      status: 'deprecated',
    });

    expect(fromOpenRouter(GLM_5_3, enrichment).status).toBe('deprecated');
  });

  it('turns the expiration date into the retirement date', () => {
    expect(fromOpenRouter(SEED_2_0_CODE, null).retiresAt).toBe('2026-11-11');
  });

  it('leaves an invalid release or expiration date null', () => {
    const model = fromOpenRouter(
      {
        ...SEED_2_0_CODE,
        createdAt: new Date('2026-13-45'),
        expirationDate: new Date('2026-13-45'),
      },
      null
    );

    expect(model.releasedAt).toBeNull();
    expect(model.retiresAt).toBeNull();
  });

  it('dates the release in UTC', () => {
    const lateEveningInMexicoCity = new Date('2026-08-12T21:30:00-06:00');

    expect(
      fromOpenRouter(
        { ...SEED_2_0_CODE, createdAt: lateEveningInMexicoCity },
        null
      ).releasedAt
    ).toBe('2026-08-13');
  });

  it('reads structured output support from response_format alone', () => {
    const model = fromOpenRouter(
      { ...SEED_2_0_CODE, supportedParameters: ['response_format'] },
      null
    );

    expect(model.structuredOutput).toBe(true);
    expect(model.toolCall).toBe(false);
  });

  it('reports no tool calls or structured output when neither parameter is supported', () => {
    const model = fromOpenRouter(
      { ...SEED_2_0_CODE, supportedParameters: ['max_tokens', 'temperature'] },
      null
    );

    expect(model.toolCall).toBe(false);
    expect(model.structuredOutput).toBe(false);
  });
});
