import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockConfig } from '../../testing/create-mock-config';
import { ModelCatalogAdapter } from './model-catalog.adapter';

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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        'claude-sonnet-4-20250514': {
          litellm_provider: 'anthropic',
          mode: 'chat',
          input_cost_per_token: 0.000099,
          output_cost_per_token: 0.000099,
        },
      }),
    } as unknown as Response);
    const adapter = makeAdapter({ AI_PRICING_REFRESH_ENABLED: true });

    await adapter.onModuleInit();

    expect(
      adapter.getPricing('anthropic:claude-sonnet-4-20250514')
        ?.inputCostPerToken
    ).toBe(0.000099);
  });
});
