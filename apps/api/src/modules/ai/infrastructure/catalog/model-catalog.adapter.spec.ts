import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MODEL_PRICES_SNAPSHOT } from '@knowtis/ai-gateway';
import { FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN } from '@knowtis/shared-types';

import { AI_SETTING_DEFAULTS } from '../../domain/ai-settings';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import { createMockConfig } from '../../testing/create-mock-config';
import { ModelCatalogAdapter } from './model-catalog.adapter';

function mockRefresh(payload: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => payload,
  } as unknown as Response);
}

function makeAdapter(overrides?: Record<string, unknown>) {
  return new ModelCatalogAdapter(
    createMockConfig({ AI_PRICING_REFRESH_ENABLED: false, ...overrides })
  );
}

describe('ModelCatalogAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves pricing for snapshot models', () => {
    const adapter = makeAdapter();
    expect(
      adapter.getPricing('anthropic:claude-sonnet-4-20250514')
        ?.inputCostPerToken
    ).toBeGreaterThan(0);
    expect(adapter.isSupported('anthropic:claude-sonnet-4-20250514')).toBe(
      true
    );
  });

  it('warns once per unknown model and returns undefined pricing', () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const adapter = makeAdapter();

    expect(adapter.getPricing('anthropic:claude-drifted')).toBeUndefined();
    expect(adapter.getPricing('anthropic:claude-drifted')).toBeUndefined();

    const pricingWarns = warnSpy.mock.calls.filter(
      ([arg]) =>
        typeof arg === 'object' &&
        arg !== null &&
        'event' in arg &&
        (arg as { event: string }).event === 'ai.pricing.unknown_model'
    );
    expect(pricingWarns).toHaveLength(1);
  });

  it('does not fetch when refresh is disabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await makeAdapter().onModuleInit();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the vendored snapshot when the refresh fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const adapter = makeAdapter({ AI_PRICING_REFRESH_ENABLED: true });

    await adapter.onModuleInit();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.catalog.refresh_failed' })
    );
    expect(
      adapter.getPricing('anthropic:claude-sonnet-4-20250514')
    ).toBeDefined();
  });

  it('adopts refreshed pricing data on success', async () => {
    mockRefresh({
      ...MODEL_PRICES_SNAPSHOT,
      'claude-sonnet-4-20250514': {
        ...(MODEL_PRICES_SNAPSHOT['claude-sonnet-4-20250514'] as object),
        input_cost_per_token: 0.000099,
      },
    });
    const adapter = makeAdapter({ AI_PRICING_REFRESH_ENABLED: true });

    await adapter.onModuleInit();

    expect(
      adapter.getPricing('anthropic:claude-sonnet-4-20250514')
        ?.inputCostPerToken
    ).toBe(0.000099);
  });

  it('keeps the vendored snapshot when a refresh stops pricing a curated model', async () => {
    mockRefresh({
      'some-model-we-do-not-serve': {
        mode: 'chat',
        input_cost_per_token: 0.000001,
        output_cost_per_token: 0.000002,
        max_input_tokens: 128000,
      },
    });
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const adapter = makeAdapter({ AI_PRICING_REFRESH_ENABLED: true });

    await adapter.onModuleInit();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.catalog.refresh_rejected' })
    );
    expect(
      adapter.getPricing('anthropic:claude-sonnet-4-20250514')
        ?.inputCostPerToken
    ).toBeGreaterThan(0);
  });

  it('rejects a refresh that prices nothing at all', async () => {
    mockRefresh({});
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const adapter = makeAdapter({ AI_PRICING_REFRESH_ENABLED: true });

    await adapter.onModuleInit();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.catalog.refresh_rejected' })
    );
    expect(
      adapter.getPricing('anthropic:claude-sonnet-4-20250514')
    ).toBeDefined();
  });

  it('does not warn for a model priced per second instead of per token', async () => {
    mockRefresh({
      ...MODEL_PRICES_SNAPSHOT,
      'per-second-model': {
        mode: 'audio_transcription',
        input_cost_per_second: 0.0001,
      },
    });
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const adapter = makeAdapter({ AI_PRICING_REFRESH_ENABLED: true });
    await adapter.onModuleInit();

    adapter.getPricing('anthropic:per-second-model');

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.pricing.partial_model' })
    );
  });

  // Half a rate is not a rate: the missing side is charged at zero and the
  // total lands under the real spend without anything saying so.
  it('warns once when an entry prices only one side of a completion', async () => {
    mockRefresh({
      ...MODEL_PRICES_SNAPSHOT,
      'openrouter/vendor/half-priced': {
        mode: 'chat',
        input_cost_per_token: 0.000001,
        max_input_tokens: 128000,
      },
    });
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const adapter = makeAdapter({ AI_PRICING_REFRESH_ENABLED: true });
    await adapter.onModuleInit();

    adapter.getPricing('openrouter:vendor/half-priced');
    adapter.getPricing('openrouter:vendor/half-priced');

    const partialWarns = warnSpy.mock.calls.filter(
      ([arg]) =>
        typeof arg === 'object' &&
        arg !== null &&
        'event' in arg &&
        (arg as { event: string }).event === 'ai.pricing.partial_model'
    );
    expect(partialWarns).toHaveLength(1);
  });

  // An unpriced model still routes — the adapter only logs and records
  // costUsd=0, so the budget breaker never sees that spend.
  it('prices every curated model from the vendored snapshot', () => {
    const adapter = makeAdapter();

    for (const model of CURATED_MODELS) {
      expect(adapter.isSupported(model.id), model.id).toBe(true);
      const pricing = adapter.getPricing(model.id);
      expect(pricing?.inputCostPerToken, model.id).toBeGreaterThan(0);
      expect(pricing?.outputCostPerToken, model.id).toBeGreaterThan(0);
      expect(
        adapter.getContextWindow(model.id)?.maxInputTokens,
        model.id
      ).toBeGreaterThan(0);
    }
  });

  it('prices every curated open-tier model', () => {
    const adapter = makeAdapter();

    for (const model of CURATED_MODELS.filter((m) => m.tier === 'open')) {
      expect(adapter.getPricing(model.id)?.outputCostPerToken).toBeTypeOf(
        'number'
      );
    }
  });

  // These are what a caller with no key runs, so the platform pays for every one
  // of them. A default over the ceiling contradicts the free tier it defines.
  it('keeps every model the code defaults name within the free-tier ceiling', () => {
    const adapter = makeAdapter();
    const defaults = [
      AI_SETTING_DEFAULTS.ai_default_model,
      AI_SETTING_DEFAULTS.ai_fast_model,
      AI_SETTING_DEFAULTS.ai_deep_model,
      ...AI_SETTING_DEFAULTS.ai_fallback_chain
        .split(',')
        .map((id) => id.trim()),
    ];

    for (const id of defaults) {
      expect(adapter.getPricing(id)?.outputCostPerToken).toBeLessThanOrEqual(
        FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN
      );
    }
  });
});
