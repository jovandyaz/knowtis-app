import { describe, expect, it } from 'vitest';

import { SelectableModelsService } from './selectable-models.service';

const SYSTEM_DEFAULT = 'anthropic:claude-sonnet-4-6';

function makeService(opts: {
  supported: Set<string>;
  available: Set<string>;
  context?: Record<string, number>;
  pricing?: Record<
    string,
    { inputCostPerToken: number; outputCostPerToken: number }
  >;
}) {
  const catalog = {
    isSupported: (id: string) => opts.supported.has(id),
    isFast: () => false,
    getContextWindow: (id: string) =>
      opts.context?.[id]
        ? { maxInputTokens: opts.context[id], maxOutputTokens: 4096 }
        : undefined,
    getPricing: (id: string) =>
      opts.pricing?.[id] ||
      (opts.supported.has(id)
        ? { inputCostPerToken: 0.000001, outputCostPerToken: 0.000005 }
        : undefined),
  };
  const registry = { isModelAvailable: (id: string) => opts.available.has(id) };
  return new SelectableModelsService(catalog as never, registry as never);
}

describe('SelectableModelsService', () => {
  it('omits curated models whose provider key is not configured', () => {
    const svc = makeService({
      supported: new Set(['anthropic:claude-sonnet-4-6', 'openai:gpt-5.5']),
      available: new Set(['anthropic:claude-sonnet-4-6']),
    });
    const ids = svc.list(SYSTEM_DEFAULT).map((m) => m.id);
    expect(ids).toContain('anthropic:claude-sonnet-4-6');
    expect(ids).not.toContain('openai:gpt-5.5');
  });

  it('marks the system default with isDefault', () => {
    const svc = makeService({
      supported: new Set([SYSTEM_DEFAULT]),
      available: new Set([SYSTEM_DEFAULT]),
    });
    const def = svc.list(SYSTEM_DEFAULT).find((m) => m.id === SYSTEM_DEFAULT);
    expect(def?.isDefault).toBe(true);
  });

  it('isSelectable is false for an uncurated or unavailable id', () => {
    const svc = makeService({
      supported: new Set([SYSTEM_DEFAULT]),
      available: new Set([SYSTEM_DEFAULT]),
    });
    expect(svc.isSelectable(SYSTEM_DEFAULT)).toBe(true);
    expect(svc.isSelectable('anthropic:not-curated')).toBe(false);
    expect(svc.isSelectable('openai:gpt-5.5')).toBe(false); // curated but unavailable
  });

  it('derives costClass from outputCostPerToken across tiers', () => {
    const ids = [
      'anthropic:claude-haiku-4-5-20251001',
      'anthropic:claude-sonnet-4-6',
      'anthropic:claude-opus-4-8',
    ];
    const svc = makeService({
      supported: new Set(ids),
      available: new Set(ids),
      pricing: {
        'anthropic:claude-haiku-4-5-20251001': {
          inputCostPerToken: 0.0000008,
          outputCostPerToken: 0.000005,
        },
        'anthropic:claude-sonnet-4-6': {
          inputCostPerToken: 0.000003,
          outputCostPerToken: 0.000015,
        },
        'anthropic:claude-opus-4-8': {
          inputCostPerToken: 0.000005,
          outputCostPerToken: 0.000025,
        },
      },
    });
    const byId = Object.fromEntries(
      svc.list(SYSTEM_DEFAULT).map((m) => [m.id, m.costClass])
    );
    expect(byId['anthropic:claude-haiku-4-5-20251001']).toBe(1);
    expect(byId['anthropic:claude-sonnet-4-6']).toBe(2);
    expect(byId['anthropic:claude-opus-4-8']).toBe(3);
  });

  it('applies costClass thresholds at the boundary values', () => {
    const ids = [
      'openai:gpt-5.4-mini',
      'anthropic:claude-sonnet-4-6',
      'openai:gpt-5.4',
      'anthropic:claude-opus-4-8',
    ];
    const svc = makeService({
      supported: new Set(ids),
      available: new Set(ids),
      pricing: {
        'openai:gpt-5.4-mini': {
          inputCostPerToken: 0,
          outputCostPerToken: 0.0000099,
        },
        'anthropic:claude-sonnet-4-6': {
          inputCostPerToken: 0,
          outputCostPerToken: 0.00001,
        },
        'openai:gpt-5.4': {
          inputCostPerToken: 0,
          outputCostPerToken: 0.0000199,
        },
        'anthropic:claude-opus-4-8': {
          inputCostPerToken: 0,
          outputCostPerToken: 0.00002,
        },
      },
    });
    const byId = Object.fromEntries(
      svc.list(SYSTEM_DEFAULT).map((m) => [m.id, m.costClass])
    );
    expect(byId['openai:gpt-5.4-mini']).toBe(1);
    expect(byId['anthropic:claude-sonnet-4-6']).toBe(2);
    expect(byId['openai:gpt-5.4']).toBe(2);
    expect(byId['anthropic:claude-opus-4-8']).toBe(3);
  });
});
