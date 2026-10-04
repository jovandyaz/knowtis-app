import { describe, expect, it, vi } from 'vitest';

import { providerOf } from '@knowtis/ai-gateway';
import type {
  ByokProvider,
  ModelReasoning,
  ReasoningEffort,
} from '@knowtis/shared-types';

import { createExecutionContext } from '../../testing/create-execution-context';
import { createResolutionsStub } from '../../testing/platform-resolutions';
import { createSnapshotIndex } from '../../testing/snapshot-index';
import type { AIConfigService } from './ai-config.service';
import { ModelPreferenceService } from './model-preference.service';
import { SelectableModelsService } from './selectable-models.service';
import { TurnEffortResolver } from './turn-effort.resolver';

const USER = 'user-1';
const MODEL = 'openrouter:z-ai/glm-5.3';
const GLM_5_2 = 'openrouter:z-ai/glm-5.2';
const GLM_5_2_LADDER: ModelReasoning = {
  levels: ['high', 'xhigh'],
  mandatory: false,
};
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
  it('maps the global default to the nearest level of an openrouter ladder that lacks it', async () => {
    const { resolver } = make(GLM_5_2_LADDER);

    await expect(
      resolver.resolve({ execution: billedToKey(GLM_5_2), model: GLM_5_2 })
    ).resolves.toEqual({ step: 'high', toolFree: 'high' });
  });

  it('runs an openrouter model at the global default when its ladder lists it', async () => {
    const { resolver } = make({
      levels: ['low', 'medium', 'high'],
      mandatory: false,
    });

    await expect(
      resolver.resolve({ execution: FREE_CALLER, model: MODEL })
    ).resolves.toEqual({ step: GLOBAL_DEFAULT, toolFree: 'low' });
  });

  it('lowers the tool-free call to the lowest listed level when the ladder lacks the tool-free level', async () => {
    const { resolver } = make(GLM_5_2_LADDER);

    await expect(
      resolver.resolve({
        execution: billedToKey(GLM_5_2),
        model: GLM_5_2,
        requested: 'xhigh',
      })
    ).resolves.toEqual({ step: 'xhigh', toolFree: 'high' });
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
    ).resolves.toEqual({ step: 'max', toolFree: 'low' });
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
    ).resolves.toEqual({ step: 'high', toolFree: 'low' });
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
    ).resolves.toEqual({ step: 'low', toolFree: 'low' });
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
    ).resolves.toEqual({ step: GLOBAL_DEFAULT, toolFree: 'low' });
  });

  it('sends no effort to a direct-provider model whose ladder lacks the global default', async () => {
    const { resolver } = make({ levels: ['low', 'high'], mandatory: true });

    await expect(
      resolver.resolve({ execution: FREE_CALLER, model: DIRECT_MODEL })
    ).resolves.toBeUndefined();
  });

  it('keeps forwarding the global default, and the tool-free level, to an openrouter model whose ladder is unknown', async () => {
    const { resolver } = make(null);

    await expect(
      resolver.resolve({ execution: FREE_CALLER, model: MODEL })
    ).resolves.toEqual({ step: GLOBAL_DEFAULT, toolFree: 'low' });
  });

  it('falls back through the same gate after a refused request on a direct provider', async () => {
    const { resolver, modelPreference } = make({
      levels: ['low', 'high'],
      mandatory: false,
    });
    const execution = billedToKey(DIRECT_MODEL);

    await expect(
      resolver.resolve({
        execution,
        model: DIRECT_MODEL,
        requested: 'xhigh',
      })
    ).resolves.toBeUndefined();
    expect(modelPreference.reasoningFor).toHaveBeenCalledTimes(1);
    expect(modelPreference.reasoningFor).toHaveBeenCalledWith(
      DIRECT_MODEL,
      execution.byokProviders
    );
  });

  it('reads the declaration with no key providers on an anonymous turn', async () => {
    const { resolver, modelPreference } = make({
      levels: ['low', 'medium', 'high'],
      mandatory: false,
    });

    await expect(
      resolver.resolve({
        execution: ANONYMOUS_CALLER,
        model: DIRECT_MODEL,
      })
    ).resolves.toEqual({ step: GLOBAL_DEFAULT, toolFree: 'low' });
    expect(modelPreference.reasoningFor).toHaveBeenCalledWith(
      DIRECT_MODEL,
      new Set()
    );
  });

  it('keeps a free caller on the global default when its trimmed ladder leaves no level at or under the ceiling', async () => {
    const { resolver } = make(null);

    await expect(
      resolver.resolve({
        execution: FREE_CALLER,
        model: MODEL,
        requested: 'high',
      })
    ).resolves.toEqual({ step: GLOBAL_DEFAULT, toolFree: 'low' });
  });

  it('falls back onto the nearest listed level when a byok caller asks for one the ladder lacks', async () => {
    const { resolver } = make({ levels: ['xhigh', 'max'], mandatory: true });

    await expect(
      resolver.resolve({
        execution: billedToKey(MODEL),
        model: MODEL,
        requested: 'high',
      })
    ).resolves.toEqual({ step: 'xhigh', toolFree: 'xhigh' });
  });

  it('falls back on a level the model does not declare to the listed level nearest the global default', async () => {
    const { resolver } = make({ levels: ['low', 'high'], mandatory: false });

    await expect(
      resolver.resolve({
        execution: billedToKey(MODEL),
        model: MODEL,
        requested: 'xhigh',
      })
    ).resolves.toEqual({ step: 'low', toolFree: 'low' });
  });

  it('falls back for a reasoning model that enumerates no efforts', async () => {
    const { resolver } = make({ levels: [], mandatory: true });

    await expect(
      resolver.resolve({
        execution: billedToKey(MODEL),
        model: MODEL,
        requested: 'high',
      })
    ).resolves.toEqual({ step: GLOBAL_DEFAULT, toolFree: 'low' });
  });

  it('falls back when the model declares no reasoning at all', async () => {
    const { resolver } = make(null);

    await expect(
      resolver.resolve({
        execution: billedToKey(MODEL),
        model: MODEL,
        requested: 'high',
      })
    ).resolves.toEqual({ step: GLOBAL_DEFAULT, toolFree: 'low' });
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
    ).resolves.toEqual({ step: 'high', toolFree: 'low' });
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

  describe('with the real model preference service', () => {
    function makeReal(
      isModelAvailable: (model: string) => boolean = () => false
    ) {
      const index = createSnapshotIndex();
      const promoted = { snapshot: () => [], isFresh: () => true };
      const selectable = new SelectableModelsService(
        {
          isSupported: () => true,
          getPricing: () => undefined,
          getContextWindow: () => undefined,
        },
        { isModelAvailable } as never,
        promoted as never,
        index,
        createResolutionsStub()
      );
      const aiConfig = {
        getReasoningEffort: vi.fn().mockResolvedValue(GLOBAL_DEFAULT),
      };
      const modelPreference = new ModelPreferenceService(
        {} as never,
        selectable,
        aiConfig as never,
        index,
        promoted as never
      );
      return new TurnEffortResolver(aiConfig as never, modelPreference);
    }

    it("applies the declared level of a model the turn's key unlocks", async () => {
      const resolver = makeReal();
      const execution = billedToKey(DIRECT_MODEL);

      await expect(
        resolver.resolve({ execution, model: DIRECT_MODEL, requested: 'high' })
      ).resolves.toEqual({ step: 'high', toolFree: 'low' });
      await expect(
        resolver.resolve({ execution, model: DIRECT_MODEL })
      ).resolves.toEqual({ step: GLOBAL_DEFAULT, toolFree: 'low' });
    });

    it.each([
      { caller: 'a free caller', execution: FREE_CALLER },
      { caller: 'an openrouter key', execution: billedToKey(GLM_5_2) },
    ])(
      "keeps $caller's default turn on glm-5.2 inside its index ladder",
      async ({ execution }) => {
        const resolver = makeReal((model) => model === GLM_5_2);

        await expect(
          resolver.resolve({ execution, model: GLM_5_2 })
        ).resolves.toEqual({ step: 'high', toolFree: 'high' });
      }
    );

    it('sends no effort to a model the turn holds no key for', async () => {
      const resolver = makeReal();

      await expect(
        resolver.resolve({
          execution: FREE_CALLER,
          model: DIRECT_MODEL,
          requested: 'high',
        })
      ).resolves.toBeUndefined();
      await expect(
        resolver.resolve({ execution: FREE_CALLER, model: DIRECT_MODEL })
      ).resolves.toBeUndefined();
    });
  });
});
