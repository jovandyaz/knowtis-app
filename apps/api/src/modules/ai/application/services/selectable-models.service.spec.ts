import { describe, expect, it } from 'vitest';

import { SelectableModelsService } from './selectable-models.service';

const SYSTEM_DEFAULT = 'anthropic:claude-sonnet-4-20250514';

function makeService(opts: {
  supported: Set<string>;
  available: Set<string>;
  context?: Record<string, number>;
}) {
  const catalog = {
    isSupported: (id: string) => opts.supported.has(id),
    isFast: () => false,
    getContextWindow: (id: string) =>
      opts.context?.[id]
        ? { maxInputTokens: opts.context[id], maxOutputTokens: 4096 }
        : undefined,
    getPricing: (id: string) =>
      opts.supported.has(id)
        ? { inputCostPerToken: 0.000001, outputCostPerToken: 0.000005 }
        : undefined,
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
      available: new Set(['anthropic:claude-sonnet-4-20250514']), // openai key missing
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
});
