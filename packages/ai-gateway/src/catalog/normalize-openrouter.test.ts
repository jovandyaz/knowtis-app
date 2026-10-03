import { describe, expect, it } from 'vitest';

import { enrichmentFromModelsDev } from './normalize-models-dev';
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

  it('takes the canonical id from the enrichment over the derived one', () => {
    expect(
      fromOpenRouter(GLM_5_3, enrichmentFromModelsDev(MODELS_DEV_GLM_5_3))
        .canonical
    ).toBe('zhipuai/glm-5.3');
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
