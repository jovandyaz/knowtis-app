import { describe, expect, it } from 'vitest';

import { MAX_INT32 } from './indexed-model';
import { enrichmentFromModelsDev, fromModelsDev } from './normalize-models-dev';

const CLAUDE_SONNET_5_5 = {
  id: 'claude-sonnet-5-5',
  name: 'Claude Sonnet 5.5',
  description:
    'Fast Claude model for everyday coding, agents, and knowledge work',
  family: 'claude-sonnet',
  attachment: true,
  reasoning: true,
  reasoning_options: [
    { type: 'effort', values: ['low', 'medium', 'high', 'xhigh', 'max'] },
  ],
  tool_call: true,
  structured_output: true,
  temperature: false,
  knowledge: '2026-06',
  release_date: '2026-09-28',
  last_updated: '2026-09-28',
  modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
  open_weights: false,
  limit: { context: 1000000, output: 128000 },
  cost: { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
  canonical_model_id: 'anthropic/claude-sonnet-5-5',
};

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

const GPT_5_4 = {
  id: 'gpt-5.4',
  name: 'GPT-5.4',
  description:
    'Agent-ready GPT for coding and computer-use workflows at a lower cost',
  family: 'gpt',
  attachment: true,
  reasoning: true,
  reasoning_options: [
    { type: 'effort', values: ['none', 'low', 'medium', 'high', 'xhigh'] },
  ],
  tool_call: true,
  structured_output: true,
  temperature: true,
  knowledge: '2025-08-31',
  release_date: '2026-03-05',
  last_updated: '2026-03-05',
  modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
  open_weights: false,
  limit: { context: 1050000, input: 922000, output: 128000 },
  experimental: {
    modes: {
      fast: {
        cost: { input: 5, output: 30, cache_read: 0.5 },
        provider: { body: { service_tier: 'priority' } },
      },
    },
  },
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

const GPT_IMAGE_1 = {
  id: 'gpt-image-1',
  name: 'gpt-image-1',
  description:
    'OpenAI image model for production generation, edits, and brand-safe visual workflows',
  family: 'gpt-image',
  attachment: true,
  reasoning: false,
  tool_call: false,
  temperature: false,
  release_date: '2025-04-24',
  last_updated: '2025-04-24',
  modalities: { input: ['text', 'image'], output: ['image'] },
  open_weights: false,
  limit: { context: 0, input: 0, output: 0 },
  status: 'deprecated',
  canonical_model_id: 'openai/gpt-image-1',
};

const OPENROUTER_DEEPSEEK_V4_PRO = {
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

describe('fromModelsDev', () => {
  it('normalizes a models.dev entry into per-token costs and reasoning levels', () => {
    expect(fromModelsDev('anthropic', CLAUDE_SONNET_5_5)).toEqual({
      id: 'anthropic:claude-sonnet-5-5',
      provider: 'anthropic',
      name: 'Claude Sonnet 5.5',
      family: 'claude-sonnet',
      releasedAt: '2026-09-28',
      status: 'active',
      toolCall: true,
      structuredOutput: true,
      inputModalities: ['text', 'image', 'pdf'],
      outputModalities: ['text'],
      inputCostPerToken: 2e-6,
      outputCostPerToken: 1e-5,
      cacheReadCostPerToken: 2e-7,
      cacheWriteCostPerToken: 2.5e-6,
      maxInputTokens: 1000000,
      maxOutputTokens: 128000,
      reasoning: {
        levels: ['low', 'medium', 'high', 'xhigh', 'max'],
        mandatory: true,
      },
      canonical: 'anthropic/claude-sonnet-5-5',
      openWeights: false,
      retiresAt: null,
      source: 'models_dev',
    });
  });

  it('marks reasoning optional when the entry offers a toggle, reading levels from the effort option', () => {
    expect(fromModelsDev('anthropic', CLAUDE_SONNET_5)?.reasoning).toEqual({
      levels: ['low', 'medium', 'high', 'xhigh', 'max'],
      mandatory: false,
    });
  });

  it('keeps reasoning optional with no levels when the entry exposes only a toggle and a budget', () => {
    const budgetOnly = {
      ...CLAUDE_SONNET_5,
      reasoning_options: [
        { type: 'toggle' },
        { type: 'budget_tokens', min: 0, max: 24576 },
      ],
    };

    expect(fromModelsDev('google', budgetOnly)?.reasoning).toEqual({
      levels: [],
      mandatory: false,
    });
  });

  it('leaves reasoning null for a model that does not reason', () => {
    expect(fromModelsDev('openai', GPT_IMAGE_1)?.reasoning).toBeNull();
  });

  it('derives the canonical id when models.dev publishes none', () => {
    expect(fromModelsDev('openai', GPT_5_4)?.canonical).toBe('openai/gpt-5-4');
  });

  it('normalizes a published canonical id into the index identity form', () => {
    expect(
      fromModelsDev('openai', {
        ...GPT_5_4,
        canonical_model_id: 'OpenAI/GPT-5.4:flex',
      })?.canonical
    ).toBe('openai/gpt-5-4');
  });

  it('prefers the input limit over the context window and ignores tiered costs', () => {
    const model = fromModelsDev('openai', GPT_5_4);

    expect(model?.maxInputTokens).toBe(922000);
    expect(model?.inputCostPerToken).toBe(2.5e-6);
    expect(model?.outputCostPerToken).toBe(1.5e-5);
    expect(model?.cacheReadCostPerToken).toBe(2.5e-7);
    expect(model?.cacheWriteCostPerToken).toBeNull();
  });

  it('pads a month-only release date to the first of the month', () => {
    expect(
      fromModelsDev('anthropic', {
        ...CLAUDE_SONNET_5_5,
        release_date: '2026-01',
      })?.releasedAt
    ).toBe('2026-01-01');
  });

  it.each(['2026-13-45', '2026-02-30', '2026-13'])(
    'drops the impossible release date %s',
    (releaseDate) => {
      expect(
        fromModelsDev('anthropic', {
          ...CLAUDE_SONNET_5_5,
          release_date: releaseDate,
        })?.releasedAt
      ).toBeNull();
    }
  );

  it('drops a release date in any other format', () => {
    expect(
      fromModelsDev('anthropic', {
        ...CLAUDE_SONNET_5_5,
        release_date: 'September 2026',
      })?.releasedAt
    ).toBeNull();
  });

  it('accepts an entry without costs and keeps its listed status', () => {
    expect(fromModelsDev('openai', GPT_IMAGE_1)).toMatchObject({
      status: 'deprecated',
      outputModalities: ['image'],
      inputCostPerToken: null,
      outputCostPerToken: null,
      cacheReadCostPerToken: null,
      cacheWriteCostPerToken: null,
      maxInputTokens: 0,
      maxOutputTokens: 0,
      structuredOutput: null,
    });
  });

  it('keeps an entry with an unrecognized status as alpha', () => {
    const model = fromModelsDev('anthropic', {
      ...CLAUDE_SONNET_5_5,
      status: 'preview',
    });

    expect(model?.id).toBe('anthropic:claude-sonnet-5-5');
    expect(model?.status).toBe('alpha');
  });

  it('defaults absent optional facts to null or empty', () => {
    expect(
      fromModelsDev('google', { id: 'gemini-x', name: 'Gemini X' })
    ).toEqual({
      id: 'google:gemini-x',
      provider: 'google',
      name: 'Gemini X',
      family: null,
      releasedAt: null,
      status: 'active',
      toolCall: null,
      structuredOutput: null,
      inputModalities: [],
      outputModalities: [],
      inputCostPerToken: null,
      outputCostPerToken: null,
      cacheReadCostPerToken: null,
      cacheWriteCostPerToken: null,
      maxInputTokens: null,
      maxOutputTokens: null,
      reasoning: null,
      canonical: 'google/gemini-x',
      openWeights: null,
      retiresAt: null,
      source: 'models_dev',
    });
  });

  it('rejects an entry with a negative cost', () => {
    expect(
      fromModelsDev('anthropic', {
        ...CLAUDE_SONNET_5_5,
        cost: { ...CLAUDE_SONNET_5_5.cost, cache_read: -0.2 },
      })
    ).toBeNull();
  });

  it('rejects an entry with a non-finite cost', () => {
    expect(
      fromModelsDev('anthropic', {
        ...CLAUDE_SONNET_5_5,
        cost: { ...CLAUDE_SONNET_5_5.cost, input: Number.POSITIVE_INFINITY },
      })
    ).toBeNull();
  });

  it.each([
    {
      field: 'fractional context',
      limit: { context: 1_000_000.5, output: 128_000 },
    },
    {
      field: 'oversized input',
      limit: { input: MAX_INT32 + 1, output: 128_000 },
    },
    {
      field: 'fractional output',
      limit: { context: 1_000_000, output: 128_000.5 },
    },
    {
      field: 'oversized context',
      limit: { context: MAX_INT32 + 1, output: 128_000 },
    },
  ])('rejects an entry with a $field token limit', ({ limit }) => {
    expect(
      fromModelsDev('anthropic', { ...CLAUDE_SONNET_5_5, limit })
    ).toBeNull();
  });

  it('accepts a token limit of exactly MAX_INT32', () => {
    expect(
      fromModelsDev('anthropic', {
        ...CLAUDE_SONNET_5_5,
        limit: { context: MAX_INT32, output: MAX_INT32 },
      })
    ).toMatchObject({ maxInputTokens: MAX_INT32, maxOutputTokens: MAX_INT32 });
  });

  it('rejects an entry without an id or a name', () => {
    const { id: _id, ...withoutId } = CLAUDE_SONNET_5_5;
    const { name: _name, ...withoutName } = CLAUDE_SONNET_5_5;

    expect(fromModelsDev('anthropic', withoutId)).toBeNull();
    expect(fromModelsDev('anthropic', withoutName)).toBeNull();
    expect(fromModelsDev('anthropic', null)).toBeNull();
  });
});

describe('enrichmentFromModelsDev', () => {
  it('extracts the identity facts of an OpenRouter-listed entry', () => {
    expect(enrichmentFromModelsDev(OPENROUTER_DEEPSEEK_V4_PRO)).toEqual({
      family: 'deepseek-thinking',
      canonical: 'deepseek/deepseek-v4-pro-0813',
      openWeights: true,
      status: 'active',
    });
  });

  it('leaves the canonical null when models.dev publishes none', () => {
    const { canonical_model_id: _canonical, ...withoutCanonical } =
      OPENROUTER_DEEPSEEK_V4_PRO;

    expect(enrichmentFromModelsDev(withoutCanonical)?.canonical).toBeNull();
  });

  it('carries a non-active status', () => {
    expect(
      enrichmentFromModelsDev({ ...OPENROUTER_DEEPSEEK_V4_PRO, status: 'beta' })
        ?.status
    ).toBe('beta');
  });

  it('keeps the enrichment of an entry with an unrecognized status as alpha', () => {
    expect(
      enrichmentFromModelsDev({
        ...OPENROUTER_DEEPSEEK_V4_PRO,
        status: 'preview',
      })
    ).toEqual({
      family: 'deepseek-thinking',
      canonical: 'deepseek/deepseek-v4-pro-0813',
      openWeights: true,
      status: 'alpha',
    });
  });

  it('returns null for an entry that fails the schema', () => {
    expect(
      enrichmentFromModelsDev({ ...OPENROUTER_DEEPSEEK_V4_PRO, id: 42 })
    ).toBeNull();
  });
});
