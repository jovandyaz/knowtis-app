import { describe, expect, it } from 'vitest';

import { SelectableModelsService } from './selectable-models.service';

const SYSTEM_DEFAULT = 'anthropic:claude-sonnet-5';
const NO_BYOK: ReadonlySet<string> = new Set();

function makeOpenService() {
  const catalog = {
    isSupported: () => true,
    getPricing: () => ({ outputCostPerToken: 0.000005 }),
    getContextWindow: () => ({ maxInputTokens: 1000 }),
  };
  const registry = { isModelAvailable: () => true };
  return new SelectableModelsService(catalog as never, registry as never);
}

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
      supported: new Set(['anthropic:claude-sonnet-5', 'openai:gpt-5.6']),
      available: new Set(['anthropic:claude-sonnet-5']),
    });
    const ids = svc.list(SYSTEM_DEFAULT).map((m) => m.id);
    expect(ids).toContain('anthropic:claude-sonnet-5');
    expect(ids).not.toContain('openai:gpt-5.6');
  });

  it('unlocks a model when the user has a BYOK key for its provider', () => {
    const registry = {
      isModelAvailable: (id: string) => id.startsWith('anthropic:'),
    };
    const catalog = {
      isSupported: () => true,
      getPricing: () => ({ outputCostPerToken: 0.000005 }),
      getContextWindow: () => ({ maxInputTokens: 1000 }),
    };
    const svc = new SelectableModelsService(
      catalog as never,
      registry as never
    );
    const withByok = svc.list('anthropic:claude-sonnet-5', new Set(['google']));
    expect(withByok.some((m) => m.id.startsWith('google:'))).toBe(true);
    const without = svc.list('anthropic:claude-sonnet-5');
    expect(without.some((m) => m.id.startsWith('google:'))).toBe(false);
  });

  it('flags billedToUser only for models whose provider has a BYOK key', () => {
    const registry = { isModelAvailable: () => true };
    const catalog = {
      isSupported: () => true,
      getPricing: () => ({ outputCostPerToken: 0.000005 }),
      getContextWindow: () => ({ maxInputTokens: 1000 }),
    };
    const svc = new SelectableModelsService(
      catalog as never,
      registry as never
    );
    const models = svc.list('anthropic:claude-sonnet-5', new Set(['google']));
    expect(models.find((m) => m.id.startsWith('google:'))?.billedToUser).toBe(
      true
    );
    expect(
      models.find((m) => m.id.startsWith('anthropic:'))?.billedToUser
    ).toBe(false);
  });

  it('isSelectable unlocks a curated model via a matching BYOK provider', () => {
    const svc = makeService({
      supported: new Set(['google:gemini-3.5-flash']),
      available: new Set(),
    });
    expect(svc.isSelectable('google:gemini-3.5-flash')).toBe(false);
    expect(
      svc.isSelectable('google:gemini-3.5-flash', new Set(['google']))
    ).toBe(true);
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
    expect(svc.isSelectable('openai:gpt-5.6')).toBe(false); // curated but unavailable
  });

  it('derives costClass from outputCostPerToken across tiers', () => {
    const ids = [
      'anthropic:claude-haiku-4-5-20251001',
      'anthropic:claude-sonnet-5',
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
        'anthropic:claude-sonnet-5': {
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
    expect(byId['anthropic:claude-sonnet-5']).toBe(2);
    expect(byId['anthropic:claude-opus-4-8']).toBe(3);
  });

  it('applies costClass thresholds at the boundary values', () => {
    const ids = [
      'openai:gpt-5.4-mini',
      'anthropic:claude-sonnet-5',
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
        'anthropic:claude-sonnet-5': {
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
    expect(byId['anthropic:claude-sonnet-5']).toBe(2);
    expect(byId['openai:gpt-5.4']).toBe(2);
    expect(byId['anthropic:claude-opus-4-8']).toBe(3);
  });

  it('should keep a gated premium model visible but marked requires_byok', () => {
    const service = makeOpenService();
    const models = service.list(
      'openrouter:deepseek/deepseek-v3.2',
      NO_BYOK,
      true
    );
    const premium = models.find((m) => m.tier !== 'open');
    expect(premium?.access).toBe('requires_byok');
  });

  it('should refuse to select a gated model and accept it with the key', () => {
    const service = makeOpenService();
    const premiumId = 'anthropic:claude-haiku-4-5-20251001';
    expect(service.isSelectable(premiumId, NO_BYOK, true)).toBe(false);
    expect(service.isSelectable(premiumId, new Set(['anthropic']), true)).toBe(
      true
    );
  });

  it('should change nothing while the flag is off', () => {
    const service = makeOpenService();
    expect(
      service
        .list('openrouter:deepseek/deepseek-v3.2', NO_BYOK, false)
        .every((m) => m.access === 'granted')
    ).toBe(true);
  });
});
