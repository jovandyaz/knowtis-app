import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FAST_MODELS,
  LiteLLMCatalog,
  toLiteLLMKey,
} from './litellm-catalog';
import { MODEL_PRICES_SNAPSHOT } from './model-prices.snapshot';

const RAW = {
  'claude-sonnet-4-20250514': {
    litellm_provider: 'anthropic',
    mode: 'chat',
    input_cost_per_token: 0.000003,
    output_cost_per_token: 0.000015,
    cache_read_input_token_cost: 3e-7,
    cache_creation_input_token_cost: 0.00000375,
    max_input_tokens: 200000,
    max_output_tokens: 64000,
  },
  'gemini/gemini-2.0-flash': {
    litellm_provider: 'gemini',
    mode: 'chat',
    input_cost_per_token: 1e-7,
    output_cost_per_token: 4e-7,
  },
  'whisper-1': {
    litellm_provider: 'openai',
    mode: 'audio_transcription',
    input_cost_per_second: 0.0001,
  },
};

describe('toLiteLLMKey', () => {
  it('maps anthropic and openai ids to bare model names', () => {
    expect(toLiteLLMKey('anthropic:claude-sonnet-4-20250514')).toBe(
      'claude-sonnet-4-20250514'
    );
    expect(toLiteLLMKey('openai:gpt-4o-mini')).toBe('gpt-4o-mini');
  });

  it('maps google ids to the gemini/ prefix', () => {
    expect(toLiteLLMKey('google:gemini-2.0-flash')).toBe(
      'gemini/gemini-2.0-flash'
    );
  });

  it('returns undefined for unknown providers and malformed ids', () => {
    expect(toLiteLLMKey('mistral:mistral-large')).toBeUndefined();
    expect(toLiteLLMKey('no-provider')).toBeUndefined();
    expect(toLiteLLMKey(':model')).toBeUndefined();
  });
});

describe('LiteLLMCatalog', () => {
  const catalog = new LiteLLMCatalog(RAW);

  it('returns pricing for known models', () => {
    expect(catalog.getPricing('anthropic:claude-sonnet-4-20250514')).toEqual({
      inputCostPerToken: 0.000003,
      outputCostPerToken: 0.000015,
      cacheReadInputTokenCost: 3e-7,
      cacheCreationInputTokenCost: 0.00000375,
      inputCostPerSecond: undefined,
    });
  });

  it('returns undefined pricing for unknown models', () => {
    expect(catalog.getPricing('anthropic:claude-2')).toBeUndefined();
  });

  it('supports only chat-mode models', () => {
    expect(catalog.isSupported('google:gemini-2.0-flash')).toBe(true);
    expect(catalog.isSupported('openai:whisper-1')).toBe(false);
    expect(catalog.isSupported('anthropic:claude-2')).toBe(false);
  });

  it('exposes per-second pricing for transcription models', () => {
    expect(catalog.getPricing('openai:whisper-1')?.inputCostPerSecond).toBe(
      0.0001
    );
  });

  it('reports context windows when present', () => {
    expect(
      catalog.getContextWindow('anthropic:claude-sonnet-4-20250514')
    ).toEqual({ maxInputTokens: 200000, maxOutputTokens: 64000 });
  });

  it('flags fast models from the default list', () => {
    expect(catalog.isFast('anthropic:claude-haiku-4-5-20251001')).toBe(true);
    expect(catalog.isFast('anthropic:claude-sonnet-4-20250514')).toBe(false);
  });

  it('rejects updates that parse to zero entries', () => {
    const mutable = new LiteLLMCatalog(RAW);
    expect(mutable.update(null)).toBe(false);
    expect(mutable.update({})).toBe(false);
    expect(mutable.size).toBe(3);
    expect(mutable.update(RAW)).toBe(true);
  });
});

describe('vendored snapshot', () => {
  const catalog = new LiteLLMCatalog(MODEL_PRICES_SNAPSHOT);

  it('contains the models Knowtis uses today', () => {
    for (const model of [
      'anthropic:claude-sonnet-4-20250514',
      'anthropic:claude-haiku-4-5-20251001',
      'google:gemini-2.0-flash',
      'google:gemini-2.5-pro',
      'openai:gpt-4o-mini',
    ]) {
      expect(catalog.isSupported(model), model).toBe(true);
      expect(
        catalog.getPricing(model)?.inputCostPerToken,
        model
      ).toBeGreaterThan(0);
    }
  });

  it('prices whisper transcription per second', () => {
    expect(
      catalog.getPricing('openai:whisper-1')?.inputCostPerSecond
    ).toBeGreaterThan(0);
  });

  it('keeps the default fast models resolvable', () => {
    for (const model of DEFAULT_FAST_MODELS) {
      expect(catalog.getPricing(model), model).toBeDefined();
    }
  });
});
