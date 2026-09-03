import { describe, expect, it, vi } from 'vitest';

import type { ModelReasoning, ReasoningEffort } from '@knowtis/shared-types';

import type { AIConfigService } from './ai-config.service';
import type { ModelPreferenceService } from './model-preference.service';
import { TurnEffortResolver } from './turn-effort.resolver';

const USER = 'user-1';
const MODEL = 'openrouter:z-ai/glm-5.3';
const DIRECT_MODEL = 'anthropic:claude-opus-5';
const UNDECLARED_DIRECT_MODEL = 'anthropic:claude-haiku-4-5';
const GLOBAL_DEFAULT: ReasoningEffort = 'medium';

function make(declared: ModelReasoning | null) {
  const aiConfig = {
    getReasoningEffort: vi.fn().mockResolvedValue(GLOBAL_DEFAULT),
  } as unknown as AIConfigService;
  const modelPreference = {
    reasoningFor: vi.fn().mockResolvedValue(declared),
  } as unknown as ModelPreferenceService;
  return {
    aiConfig,
    modelPreference,
    resolver: new TurnEffortResolver(aiConfig, modelPreference),
  };
}

describe('TurnEffortResolver', () => {
  it('uses the global default without reading the declaration for an openrouter model', async () => {
    const { resolver, modelPreference } = make({
      levels: ['low', 'high'],
      mandatory: false,
    });

    await expect(
      resolver.resolve({ userId: USER, model: MODEL, isByok: true })
    ).resolves.toBe(GLOBAL_DEFAULT);
    expect(modelPreference.reasoningFor).not.toHaveBeenCalled();
  });

  it('grants a byok caller any level the model declares', async () => {
    const { resolver } = make({
      levels: ['low', 'high', 'max'],
      mandatory: false,
    });

    await expect(
      resolver.resolve({
        userId: USER,
        model: MODEL,
        isByok: true,
        requested: 'max',
      })
    ).resolves.toBe('max');
  });

  it('lowers a free caller above the ceiling to the highest declared level within it', async () => {
    const { resolver } = make({
      levels: ['low', 'medium', 'high', 'xhigh'],
      mandatory: false,
    });

    await expect(
      resolver.resolve({
        userId: USER,
        model: MODEL,
        isByok: false,
        requested: 'max',
      })
    ).resolves.toBe('high');
  });

  it('honours a free caller pick within the ceiling', async () => {
    const { resolver } = make({
      levels: ['low', 'medium', 'high', 'xhigh'],
      mandatory: false,
    });

    await expect(
      resolver.resolve({
        userId: USER,
        model: MODEL,
        isByok: false,
        requested: 'low',
      })
    ).resolves.toBe('low');
  });

  it('sends no effort to a direct provider whose model declares no reasoning', async () => {
    const { resolver } = make(null);

    await expect(
      resolver.resolve({
        userId: USER,
        model: UNDECLARED_DIRECT_MODEL,
        isByok: false,
      })
    ).resolves.toBeUndefined();
  });

  it('runs a declared direct-provider model at the global default when the model lists it', async () => {
    const { resolver } = make({
      levels: ['low', 'medium', 'high'],
      mandatory: false,
    });

    await expect(
      resolver.resolve({ userId: USER, model: DIRECT_MODEL, isByok: false })
    ).resolves.toBe(GLOBAL_DEFAULT);
  });

  it('sends no effort to a direct-provider model whose ladder lacks the global default', async () => {
    const { resolver } = make({ levels: ['low', 'high'], mandatory: true });

    await expect(
      resolver.resolve({ userId: USER, model: DIRECT_MODEL, isByok: false })
    ).resolves.toBeUndefined();
  });

  it('keeps forwarding the global default to an openrouter model that declares nothing', async () => {
    const { resolver, modelPreference } = make(null);

    await expect(
      resolver.resolve({ userId: USER, model: MODEL, isByok: false })
    ).resolves.toBe(GLOBAL_DEFAULT);
    expect(modelPreference.reasoningFor).not.toHaveBeenCalled();
  });

  it('falls back through the same gate after a refused request on a direct provider', async () => {
    const { resolver, modelPreference } = make({
      levels: ['low', 'high'],
      mandatory: false,
    });

    await expect(
      resolver.resolve({
        userId: USER,
        model: DIRECT_MODEL,
        isByok: true,
        requested: 'xhigh',
      })
    ).resolves.toBeUndefined();
    expect(modelPreference.reasoningFor).toHaveBeenCalledTimes(1);
  });

  it('falls back when a free caller has no level at or under the ceiling', async () => {
    const { resolver } = make({ levels: ['xhigh', 'max'], mandatory: true });

    await expect(
      resolver.resolve({
        userId: USER,
        model: MODEL,
        isByok: false,
        requested: 'high',
      })
    ).resolves.toBe(GLOBAL_DEFAULT);
  });

  it('falls back on a level the model does not declare', async () => {
    const { resolver } = make({ levels: ['low', 'high'], mandatory: false });

    await expect(
      resolver.resolve({
        userId: USER,
        model: MODEL,
        isByok: true,
        requested: 'xhigh',
      })
    ).resolves.toBe(GLOBAL_DEFAULT);
  });

  it('falls back for a reasoning model that enumerates no efforts', async () => {
    const { resolver } = make({ levels: [], mandatory: true });

    await expect(
      resolver.resolve({
        userId: USER,
        model: MODEL,
        isByok: true,
        requested: 'high',
      })
    ).resolves.toBe(GLOBAL_DEFAULT);
  });

  it('falls back when the model declares no reasoning at all', async () => {
    const { resolver } = make(null);

    await expect(
      resolver.resolve({
        userId: USER,
        model: MODEL,
        isByok: true,
        requested: 'high',
      })
    ).resolves.toBe(GLOBAL_DEFAULT);
  });

  it('warns rather than silently mismatching when a request is refused', async () => {
    const { resolver } = make({ levels: ['low'], mandatory: false });
    const warn = vi
      .spyOn(
        (resolver as unknown as { logger: { warn: (m: unknown) => void } })
          .logger,
        'warn'
      )
      .mockImplementation(() => undefined);

    await resolver.resolve({
      userId: USER,
      model: MODEL,
      isByok: true,
      requested: 'max',
    });

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent.effort_fallback',
        model: MODEL,
        requested: 'max',
      })
    );
  });

  it('warns with the applied level when a free caller is clamped below the request', async () => {
    const { resolver } = make({
      levels: ['low', 'medium', 'high', 'xhigh'],
      mandatory: false,
    });
    const warn = vi
      .spyOn(
        (resolver as unknown as { logger: { warn: (m: unknown) => void } })
          .logger,
        'warn'
      )
      .mockImplementation(() => undefined);

    await expect(
      resolver.resolve({
        userId: USER,
        model: MODEL,
        isByok: false,
        requested: 'xhigh',
      })
    ).resolves.toBe('high');
    expect(warn).toHaveBeenCalledWith({
      event: 'agent.effort_clamped',
      model: MODEL,
      requested: 'xhigh',
      applied: 'high',
    });
  });

  it('stays quiet when the request is applied unchanged', async () => {
    const { resolver } = make({
      levels: ['low', 'medium', 'high'],
      mandatory: false,
    });
    const warn = vi
      .spyOn(
        (resolver as unknown as { logger: { warn: (m: unknown) => void } })
          .logger,
        'warn'
      )
      .mockImplementation(() => undefined);

    await resolver.resolve({
      userId: USER,
      model: MODEL,
      isByok: false,
      requested: 'high',
    });

    expect(warn).not.toHaveBeenCalled();
  });
});
