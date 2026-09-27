import { describe, expect, it, vi } from 'vitest';

import { providerOf } from '@knowtis/ai-gateway';
import type {
  ByokProvider,
  ModelReasoning,
  ReasoningEffort,
} from '@knowtis/shared-types';

import { createExecutionContext } from '../../testing/create-execution-context';
import type { AIConfigService } from './ai-config.service';
import type { ModelPreferenceService } from './model-preference.service';
import { TurnEffortResolver } from './turn-effort.resolver';

const USER = 'user-1';
const MODEL = 'openrouter:z-ai/glm-5.3';
const DIRECT_MODEL = 'anthropic:claude-opus-5';
const UNDECLARED_DIRECT_MODEL = 'anthropic:claude-haiku-4-5';
const GLOBAL_DEFAULT: ReasoningEffort = 'medium';
const FREE_CALLER = createExecutionContext({ userId: USER });
const ANONYMOUS_CALLER = createExecutionContext({
  userId: USER,
  tier: 'anonymous',
});

function billedToKey(model: string) {
  return createExecutionContext({
    userId: USER,
    tier: 'byok',
    billing: { kind: 'byok', provider: providerOf(model) as ByokProvider },
  });
}

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
      resolver.resolve({ execution: billedToKey(MODEL), model: MODEL })
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
        execution: billedToKey(MODEL),
        model: MODEL,
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
        execution: FREE_CALLER,
        model: MODEL,
        requested: 'max',
      })
    ).resolves.toBe('high');
  });

  it('treats a byok-tier caller on a platform model as the free audience', async () => {
    const { resolver } = make({
      levels: ['low', 'medium', 'high', 'xhigh'],
      mandatory: false,
    });
    const execution = createExecutionContext({
      userId: USER,
      tier: 'byok',
      byokProviders: ['anthropic'],
    });

    await expect(
      resolver.resolve({ execution, model: MODEL, requested: 'max' })
    ).resolves.toBe('high');
  });

  it('honours a free caller pick within the ceiling', async () => {
    const { resolver } = make({
      levels: ['low', 'medium', 'high', 'xhigh'],
      mandatory: false,
    });

    await expect(
      resolver.resolve({
        execution: FREE_CALLER,
        model: MODEL,
        requested: 'low',
      })
    ).resolves.toBe('low');
  });

  it('sends no effort to a direct provider whose model declares no reasoning', async () => {
    const { resolver } = make(null);

    await expect(
      resolver.resolve({
        execution: FREE_CALLER,
        model: UNDECLARED_DIRECT_MODEL,
      })
    ).resolves.toBeUndefined();
  });

  it('runs a declared direct-provider model at the global default when the model lists it', async () => {
    const { resolver } = make({
      levels: ['low', 'medium', 'high'],
      mandatory: false,
    });

    await expect(
      resolver.resolve({ execution: FREE_CALLER, model: DIRECT_MODEL })
    ).resolves.toBe(GLOBAL_DEFAULT);
  });

  it('sends no effort to a direct-provider model whose ladder lacks the global default', async () => {
    const { resolver } = make({ levels: ['low', 'high'], mandatory: true });

    await expect(
      resolver.resolve({ execution: FREE_CALLER, model: DIRECT_MODEL })
    ).resolves.toBeUndefined();
  });

  it('keeps forwarding the global default to an openrouter model that declares nothing', async () => {
    const { resolver, modelPreference } = make(null);

    await expect(
      resolver.resolve({ execution: FREE_CALLER, model: MODEL })
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
        execution: billedToKey(DIRECT_MODEL),
        model: DIRECT_MODEL,
        requested: 'xhigh',
      })
    ).resolves.toBeUndefined();
    expect(modelPreference.reasoningFor).toHaveBeenCalledTimes(1);
    expect(modelPreference.reasoningFor).toHaveBeenCalledWith(DIRECT_MODEL, {
      id: USER,
      isAnonymous: false,
    });
  });

  it('reads the declaration as an anonymous caller on an anonymous turn', async () => {
    const { resolver, modelPreference } = make({
      levels: ['low', 'medium', 'high'],
      mandatory: false,
    });

    await expect(
      resolver.resolve({
        execution: ANONYMOUS_CALLER,
        model: DIRECT_MODEL,
      })
    ).resolves.toBe(GLOBAL_DEFAULT);
    expect(modelPreference.reasoningFor).toHaveBeenCalledWith(DIRECT_MODEL, {
      id: USER,
      isAnonymous: true,
    });
  });

  it('falls back when a free caller has no level at or under the ceiling', async () => {
    const { resolver } = make({ levels: ['xhigh', 'max'], mandatory: true });

    await expect(
      resolver.resolve({
        execution: FREE_CALLER,
        model: MODEL,
        requested: 'high',
      })
    ).resolves.toBe(GLOBAL_DEFAULT);
  });

  it('falls back on a level the model does not declare', async () => {
    const { resolver } = make({ levels: ['low', 'high'], mandatory: false });

    await expect(
      resolver.resolve({
        execution: billedToKey(MODEL),
        model: MODEL,
        requested: 'xhigh',
      })
    ).resolves.toBe(GLOBAL_DEFAULT);
  });

  it('falls back for a reasoning model that enumerates no efforts', async () => {
    const { resolver } = make({ levels: [], mandatory: true });

    await expect(
      resolver.resolve({
        execution: billedToKey(MODEL),
        model: MODEL,
        requested: 'high',
      })
    ).resolves.toBe(GLOBAL_DEFAULT);
  });

  it('falls back when the model declares no reasoning at all', async () => {
    const { resolver } = make(null);

    await expect(
      resolver.resolve({
        execution: billedToKey(MODEL),
        model: MODEL,
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
      execution: billedToKey(MODEL),
      model: MODEL,
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
        execution: FREE_CALLER,
        model: MODEL,
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
      execution: FREE_CALLER,
      model: MODEL,
      requested: 'high',
    });

    expect(warn).not.toHaveBeenCalled();
  });
});
