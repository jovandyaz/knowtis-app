import { describe, expect, it, vi } from 'vitest';

import type { ModelReasoning, ReasoningEffort } from '@knowtis/shared-types';

import type { AIConfigService } from './ai-config.service';
import type { ModelPreferenceService } from './model-preference.service';
import { TurnEffortResolver } from './turn-effort.resolver';

const USER = 'user-1';
const MODEL = 'openrouter:z-ai/glm-5.3';
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
  it('uses the global default and never reads the declaration when no effort is requested', async () => {
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

  it('clamps a free caller to the highest declared level within the ceiling', async () => {
    const { resolver } = make({
      levels: ['low', 'medium', 'high', 'xhigh'],
      mandatory: false,
    });

    await expect(
      resolver.resolve({
        userId: USER,
        model: MODEL,
        isByok: false,
        requested: 'high',
      })
    ).resolves.toBe('high');
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
});
