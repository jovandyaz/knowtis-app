import { describe, expect, it } from 'vitest';

import { SelectableModelsService } from './selectable-models.service';

const SYSTEM_DEFAULT = 'anthropic:claude-sonnet-4-20250514';

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
      supported: new Set([
        'anthropic:claude-sonnet-4-20250514',
        'openai:gpt-4o-mini',
      ]),
      available: new Set(['anthropic:claude-sonnet-4-20250514']),
    });
    const ids = svc.list(SYSTEM_DEFAULT).map((m) => m.id);
    expect(ids).toContain('anthropic:claude-sonnet-4-20250514');
    expect(ids).not.toContain('openai:gpt-4o-mini');
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
    expect(svc.isSelectable('openai:gpt-4o-mini')).toBe(false); // curated but unavailable
  });

  it('derives costClass from outputCostPerToken across tiers', () => {
    const svc = makeService({
      supported: new Set([
        'anthropic:claude-haiku-4-5-20251001',
        'openai:gpt-4o-mini',
        'anthropic:claude-sonnet-4-20250514',
      ]),
      available: new Set([
        'anthropic:claude-haiku-4-5-20251001',
        'openai:gpt-4o-mini',
        'anthropic:claude-sonnet-4-20250514',
      ]),
      pricing: {
        'anthropic:claude-haiku-4-5-20251001': {
          inputCostPerToken: 0.0000008,
          outputCostPerToken: 0.000005,
        },
        'openai:gpt-4o-mini': {
          inputCostPerToken: 0.00000015,
          outputCostPerToken: 0.000015,
        },
        'anthropic:claude-sonnet-4-20250514': {
          inputCostPerToken: 0.000003,
          outputCostPerToken: 0.000025,
        },
      },
    });
    const byId = Object.fromEntries(
      svc
        .list('anthropic:claude-sonnet-4-20250514')
        .map((m) => [m.id, m.costClass])
    );
    expect(byId['anthropic:claude-haiku-4-5-20251001']).toBe(1);
    expect(byId['openai:gpt-4o-mini']).toBe(2);
    expect(byId['anthropic:claude-sonnet-4-20250514']).toBe(3);
  });
});
