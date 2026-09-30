import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type {
  ModelIntent,
  UpdateAiPreferencesInput,
} from '@knowtis/shared-types';

import { AiUnavailableError } from '../../domain/errors/ai-unavailable.error';
import type { AiExecutionContext } from '../../domain/execution-context/ai-execution-context';
import { ModelUnavailableException } from '../../model-unavailable.exception';
import { createExecutionContext } from '../../testing/create-execution-context';
import { ModelPreferenceService } from './model-preference.service';
import { SelectableModelsService } from './selectable-models.service';

const RETIRED_MODEL = 'anthropic:claude-retired';

function makeChooser(
  settings: {
    preferredModel?: string | null;
    preferredIntent?: ModelIntent | null;
  } = {}
) {
  const selectable = new SelectableModelsService(
    {
      isSupported: (id: string) => id !== RETIRED_MODEL,
      getPricing: () => ({
        inputCostPerToken: 0.000001,
        outputCostPerToken: 0.000001,
      }),
      getContextWindow: () => ({ maxInputTokens: 1000 }),
    },
    {
      isModelAvailable: (id: string) => id.startsWith('openrouter:'),
    } as never,
    { snapshot: () => [] } as never
  );
  const repo = {
    getSettings: vi.fn().mockResolvedValue({
      preferredModel: settings.preferredModel ?? null,
      preferredIntent: settings.preferredIntent ?? null,
      ghostTextEnabled: true,
    }),
    patchSettings: vi.fn().mockResolvedValue(undefined),
  };
  const aiConfig = {
    getIntentModels: vi.fn().mockResolvedValue({
      fast: 'openrouter:minimax/minimax-m2.5',
      balanced: 'openrouter:deepseek/deepseek-v3.2',
      powerful: 'openrouter:moonshotai/kimi-k2.5',
    }),
  };
  const svc = new ModelPreferenceService(
    repo as never,
    selectable,
    aiConfig as never
  );
  return { svc, repo, selectable };
}

const NO_KEYS: ReadonlySet<string> = new Set();
const FREE_CALLER = createExecutionContext({ tier: 'free' });
const BYOK_ANTHROPIC = createExecutionContext({
  tier: 'byok',
  byokProviders: ['anthropic'],
});
const WRITING_TIERS = [
  FREE_CALLER,
  BYOK_ANTHROPIC,
  createExecutionContext({ tier: 'byok', byokProviders: ['openrouter'] }),
  createExecutionContext({ tier: 'byok', byokProviders: ['openai', 'google'] }),
];

/** Writes as the session behind `execution`, whose tier is resolved only when the write asks for it. */
function writeAs(
  svc: ModelPreferenceService,
  execution: AiExecutionContext,
  patch: UpdateAiPreferencesInput,
  tierOf: () => Promise<AiExecutionContext> = async () => execution
) {
  return svc.setUserPreferences(
    {
      userId: execution.subject.userId,
      isAnonymous: execution.tier === 'anonymous',
    },
    patch,
    tierOf
  );
}

describe('ModelPreferenceService', () => {
  describe('listModels', () => {
    it('answers the tier envelope for an anonymous caller: one model, one intent', async () => {
      const catalog = await makeChooser().svc.listModels(
        createExecutionContext({ tier: 'anonymous' })
      );
      expect(catalog.tier).toBe('anonymous');
      expect(catalog.models.map((m) => m.id)).toEqual([
        'openrouter:deepseek/deepseek-v3.2',
      ]);
      expect(catalog.intents).toEqual([
        {
          intent: 'balanced',
          available: true,
          modelId: 'openrouter:deepseek/deepseek-v3.2',
          substituted: false,
        },
      ]);
    });

    it('answers the platform intents for a free caller', async () => {
      const catalog = await makeChooser().svc.listModels(FREE_CALLER);
      expect(catalog.tier).toBe('free');
      expect(catalog.models.map((m) => m.id)).toEqual([
        'openrouter:minimax/minimax-m2.5',
        'openrouter:deepseek/deepseek-v3.2',
        'openrouter:moonshotai/kimi-k2.5',
      ]);
      expect(catalog.intents).toEqual([
        {
          intent: 'fast',
          available: true,
          modelId: 'openrouter:minimax/minimax-m2.5',
          substituted: false,
        },
        {
          intent: 'balanced',
          available: true,
          modelId: 'openrouter:deepseek/deepseek-v3.2',
          substituted: false,
        },
        {
          intent: 'powerful',
          available: true,
          modelId: 'openrouter:moonshotai/kimi-k2.5',
          substituted: false,
        },
      ]);
    });

    it('answers the intents a byok caller’s key routes', async () => {
      const catalog = await makeChooser().svc.listModels(BYOK_ANTHROPIC);
      expect(catalog.tier).toBe('byok');
      expect(catalog.intents).toEqual([
        {
          intent: 'fast',
          available: true,
          modelId: 'anthropic:claude-haiku-4-5',
          substituted: false,
        },
        {
          intent: 'balanced',
          available: true,
          modelId: 'anthropic:claude-sonnet-5',
          substituted: false,
        },
        {
          intent: 'powerful',
          available: true,
          modelId: 'anthropic:claude-opus-5',
          substituted: false,
        },
      ]);
    });

    it('marks the model serving a byok caller’s balanced intent as the default', async () => {
      const catalog = await makeChooser().svc.listModels(BYOK_ANTHROPIC);
      expect(
        catalog.models.filter((m) => m.isDefault).map((m) => m.id)
      ).toEqual(['anthropic:claude-sonnet-5']);
    });

    it.each(
      WRITING_TIERS.map(
        (execution) =>
          [
            execution.tier,
            [...execution.byokProviders].join('+') || 'no key',
            execution,
          ] as const
      )
    )(
      'accepts every model it lists as a preference (%s, %s)',
      async (_tier, _keys, execution) => {
        const { svc, repo } = makeChooser();
        const listed = (await svc.listModels(execution)).models;

        for (const model of listed) {
          await writeAs(svc, execution, { preferredModel: model.id });
        }

        expect(listed.length).toBeGreaterThan(0);
        expect(repo.patchSettings.mock.calls).toEqual(
          listed.map((model) => [
            execution.subject.userId,
            model.billedToUser
              ? { preferredModel: model.id }
              : { preferredModel: null, preferredIntent: model.servesIntent },
          ])
        );
      }
    );
  });

  describe('setUserPreferences', () => {
    it('refuses an anonymous caller', async () => {
      await expect(
        writeAs(
          makeChooser().svc,
          createExecutionContext({ tier: 'anonymous' }),
          { preferredIntent: 'fast' }
        )
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an anonymous caller before resolving the tier', async () => {
      const tierOf = vi.fn();
      await expect(
        writeAs(
          makeChooser().svc,
          createExecutionContext({ tier: 'anonymous' }),
          { preferredModel: 'openrouter:deepseek/deepseek-v3.2' },
          tierOf
        )
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tierOf).not.toHaveBeenCalled();
    });

    it('resolves the tier only for a patch that names a model', async () => {
      const { svc, repo } = makeChooser();
      const tierOf = vi
        .fn<() => Promise<AiExecutionContext>>()
        .mockRejectedValue(new AiUnavailableError('tier', 'key store down'));

      await writeAs(svc, FREE_CALLER, { ghostTextEnabled: false }, tierOf);
      await writeAs(svc, FREE_CALLER, { preferredIntent: 'fast' }, tierOf);
      await writeAs(svc, FREE_CALLER, { preferredModel: null }, tierOf);
      expect(tierOf).not.toHaveBeenCalled();

      await expect(
        writeAs(
          svc,
          FREE_CALLER,
          { preferredModel: 'openrouter:minimax/minimax-m2.5' },
          tierOf
        )
      ).rejects.toBeInstanceOf(AiUnavailableError);
      expect(tierOf).toHaveBeenCalledTimes(1);
      expect(repo.patchSettings).toHaveBeenCalledTimes(3);
    });

    it('refuses a model outside the tier with AI_MODEL_UNAVAILABLE and a suggestion', async () => {
      const error = await writeAs(
        makeChooser().svc,
        createExecutionContext({ tier: 'free' }),
        { preferredModel: 'anthropic:claude-opus-5' }
      ).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ModelUnavailableException);
      expect((error as ModelUnavailableException).getResponse()).toEqual({
        message: 'This model is not available to you.',
        code: 'AI_MODEL_UNAVAILABLE',
        details: {
          reason: 'not_in_tier',
          suggestedModel: 'openrouter:deepseek/deepseek-v3.2',
        },
      });
    });

    it('refuses a model the catalog no longer prices as retired, without storing it', async () => {
      const { svc, repo } = makeChooser();
      const error = await writeAs(svc, FREE_CALLER, {
        preferredModel: RETIRED_MODEL,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ModelUnavailableException);
      expect((error as ModelUnavailableException).getResponse()).toMatchObject({
        details: { reason: 'model_retired' },
      });
      expect(repo.patchSettings).not.toHaveBeenCalled();
    });

    it('stores a model inside the byok scope', async () => {
      const { svc, repo } = makeChooser();
      await writeAs(
        svc,
        createExecutionContext({ tier: 'byok', byokProviders: ['anthropic'] }),
        { preferredModel: 'anthropic:claude-opus-5' }
      );
      expect(repo.patchSettings).toHaveBeenCalledWith('user-1', {
        preferredModel: 'anthropic:claude-opus-5',
      });
    });

    it('stores a free caller’s pick of a platform model as the intent it serves', async () => {
      const { svc, repo } = makeChooser();
      await writeAs(svc, FREE_CALLER, {
        preferredModel: 'openrouter:minimax/minimax-m2.5',
        preferredIntent: 'powerful',
      });
      expect(repo.patchSettings).toHaveBeenCalledWith('user-1', {
        preferredModel: null,
        preferredIntent: 'fast',
      });
    });

    it('keeps a key-billed pick a model even when it serves an intent', async () => {
      const { svc, repo } = makeChooser();
      await writeAs(
        svc,
        createExecutionContext({ tier: 'byok', byokProviders: ['openrouter'] }),
        { preferredModel: 'openrouter:deepseek/deepseek-v3.2' }
      );
      await writeAs(svc, BYOK_ANTHROPIC, {
        preferredModel: 'anthropic:claude-sonnet-5',
      });
      expect(repo.patchSettings.mock.calls).toEqual([
        ['user-1', { preferredModel: 'openrouter:deepseek/deepseek-v3.2' }],
        ['user-1', { preferredModel: 'anthropic:claude-sonnet-5' }],
      ]);
    });

    it('clears the model without reading the catalog', async () => {
      const { svc, repo, selectable } = makeChooser();
      const catalogFor = vi.spyOn(selectable, 'catalogFor');
      await writeAs(svc, FREE_CALLER, { preferredModel: null });
      expect(repo.patchSettings).toHaveBeenCalledWith('user-1', {
        preferredModel: null,
      });
      expect(catalogFor).not.toHaveBeenCalled();
    });

    it('skips the write when the patch carries no values', async () => {
      const { svc, repo } = makeChooser();
      await writeAs(svc, FREE_CALLER, {});
      const dtoShaped: Parameters<typeof svc.setUserPreferences>[1] = {};
      Object.assign(dtoShaped, {
        preferredModel: undefined,
        preferredIntent: undefined,
      });
      await writeAs(svc, FREE_CALLER, dtoShaped);
      expect(repo.patchSettings).not.toHaveBeenCalled();
    });

    it('passes an intent-only patch through unvalidated', async () => {
      const { svc, repo } = makeChooser();
      await writeAs(svc, FREE_CALLER, { preferredIntent: 'fast' });
      expect(repo.patchSettings).toHaveBeenCalledWith('user-1', {
        preferredIntent: 'fast',
      });
    });

    it('stores a ghost text patch without validating a model', async () => {
      const { svc, repo, selectable } = makeChooser();
      const catalogFor = vi.spyOn(selectable, 'catalogFor');
      await writeAs(svc, FREE_CALLER, { ghostTextEnabled: false });
      expect(repo.patchSettings).toHaveBeenCalledWith('user-1', {
        ghostTextEnabled: false,
      });
      expect(catalogFor).not.toHaveBeenCalled();
    });
  });

  describe('getUserPreferences', () => {
    const MINIMAX = 'openrouter:minimax/minimax-m2.5';

    it('returns a stored model no intent is configured to without resolving the tier', async () => {
      const { svc } = makeChooser({
        preferredModel: 'openai:gpt-4o-mini',
        preferredIntent: 'powerful',
      });
      const tierOf = vi.fn();
      expect(await svc.getUserPreferences('u1', tierOf)).toEqual({
        preferredModel: 'openai:gpt-4o-mini',
        preferredIntent: 'powerful',
        ghostTextEnabled: true,
      });
      expect(tierOf).not.toHaveBeenCalled();
    });

    it('returns the ghost text preference', async () => {
      const { svc, repo } = makeChooser();
      repo.getSettings.mockResolvedValue({
        preferredModel: null,
        preferredIntent: null,
        ghostTextEnabled: false,
      });
      expect(
        (await svc.getUserPreferences('u1', async () => FREE_CALLER))
          .ghostTextEnabled
      ).toBe(false);
    });

    it('answers a free caller’s stored platform model as the intent a turn serves', async () => {
      const { svc } = makeChooser({
        preferredModel: MINIMAX,
        preferredIntent: 'powerful',
      });

      const answered = await svc.getUserPreferences(
        'user-1',
        async () => FREE_CALLER
      );
      const served = await svc.chooseTurnModel(FREE_CALLER, {});

      expect(answered).toEqual({
        preferredModel: null,
        preferredIntent: 'fast',
        ghostTextEnabled: true,
      });
      expect(served).toMatchObject({ model: MINIMAX });
    });

    it('keeps a key-billed pick of a platform intent model a model', async () => {
      const { svc } = makeChooser({
        preferredModel: 'openrouter:deepseek/deepseek-v3.2',
        preferredIntent: 'fast',
      });
      expect(
        await svc.getUserPreferences('user-1', async () =>
          createExecutionContext({
            tier: 'byok',
            byokProviders: ['openrouter'],
          })
        )
      ).toEqual({
        preferredModel: 'openrouter:deepseek/deepseek-v3.2',
        preferredIntent: 'fast',
        ghostTextEnabled: true,
      });
    });

    it('answers the stored row when the tier cannot be resolved', async () => {
      const { svc } = makeChooser({
        preferredModel: MINIMAX,
        preferredIntent: 'powerful',
      });
      expect(
        await svc.getUserPreferences('user-1', () =>
          Promise.reject(new AiUnavailableError('tier', 'key store down'))
        )
      ).toEqual({
        preferredModel: MINIMAX,
        preferredIntent: 'powerful',
        ghostTextEnabled: true,
      });
    });

    it('surfaces a tier failure that is not an outage', async () => {
      const { svc } = makeChooser({ preferredModel: MINIMAX });
      await expect(
        svc.getUserPreferences('user-1', () => Promise.reject(new Error('bug')))
      ).rejects.toThrow('bug');
    });
  });

  describe('reasoningFor', () => {
    it('reads the full ladder of a model on the caller key', async () => {
      expect(
        await makeChooser().svc.reasoningFor(
          'anthropic:claude-sonnet-5',
          new Set(['anthropic'])
        )
      ).toEqual({
        levels: ['low', 'medium', 'high', 'xhigh', 'max'],
        mandatory: false,
      });
    });

    it('returns null for an offered model with no declaration', async () => {
      expect(
        await makeChooser().svc.reasoningFor(
          'openrouter:deepseek/deepseek-v3.2',
          NO_KEYS
        )
      ).toBe(null);
    });

    it('returns null for a model outside the offered union', async () => {
      expect(
        await makeChooser().svc.reasoningFor(
          'openai:not-offered',
          new Set(['openai'])
        )
      ).toBe(null);
    });
  });

  describe('chooseTurnModel', () => {
    it('serves a byok caller their key intent, never the platform one', async () => {
      await expect(
        makeChooser().svc.chooseTurnModel(
          createExecutionContext({
            tier: 'byok',
            byokProviders: ['anthropic'],
          }),
          {}
        )
      ).resolves.toMatchObject({
        kind: 'resolved',
        model: 'anthropic:claude-sonnet-5',
      });
    });

    it('serves a free caller their stored intent', async () => {
      await expect(
        makeChooser({ preferredIntent: 'fast' }).svc.chooseTurnModel(
          createExecutionContext({ tier: 'free' }),
          {}
        )
      ).resolves.toMatchObject({ model: 'openrouter:minimax/minimax-m2.5' });
    });

    it('serves a free caller’s stored platform model as the intent it serves, ahead of a stored intent', async () => {
      await expect(
        makeChooser({
          preferredModel: 'openrouter:minimax/minimax-m2.5',
          preferredIntent: 'powerful',
        }).svc.chooseTurnModel(FREE_CALLER, {})
      ).resolves.toEqual({
        kind: 'resolved',
        model: 'openrouter:minimax/minimax-m2.5',
        resolution: {
          requested: null,
          resolved: 'openrouter:minimax/minimax-m2.5',
        },
      });
    });

    it('keeps a stored intent when the stored platform model left the catalog', async () => {
      await expect(
        makeChooser({
          preferredModel: 'openrouter:z-ai/glm-5.2',
          preferredIntent: 'powerful',
        }).svc.chooseTurnModel(FREE_CALLER, {})
      ).resolves.toMatchObject({ model: 'openrouter:moonshotai/kimi-k2.5' });
    });

    it('serves a byok caller’s stored key-billed model as that model', async () => {
      await expect(
        makeChooser({
          preferredModel: 'anthropic:claude-opus-5',
        }).svc.chooseTurnModel(BYOK_ANTHROPIC, {})
      ).resolves.toMatchObject({ model: 'anthropic:claude-opus-5' });
    });

    it('refuses an explicit model outside the tier', async () => {
      await expect(
        makeChooser().svc.chooseTurnModel(
          createExecutionContext({ tier: 'free' }),
          { explicit: 'anthropic:claude-opus-5' }
        )
      ).resolves.toEqual({
        kind: 'unavailable',
        reason: 'not_in_tier',
        suggestedModel: 'openrouter:deepseek/deepseek-v3.2',
      });
    });

    it("falls back a free caller's pinned open model to the platform intent and reports it", async () => {
      await expect(
        makeChooser().svc.chooseTurnModel(
          createExecutionContext({ tier: 'free' }),
          { pinned: 'openrouter:z-ai/glm-5.2' }
        )
      ).resolves.toEqual({
        kind: 'resolved',
        model: 'openrouter:deepseek/deepseek-v3.2',
        resolution: {
          requested: 'openrouter:z-ai/glm-5.2',
          resolved: 'openrouter:deepseek/deepseek-v3.2',
          fallback: {
            reason: 'not_in_tier',
            from: 'openrouter:z-ai/glm-5.2',
            to: 'openrouter:deepseek/deepseek-v3.2',
          },
        },
      });
    });

    it("refuses a free caller's pinned key-billed model rather than moving it onto the platform", async () => {
      await expect(
        makeChooser().svc.chooseTurnModel(
          createExecutionContext({ tier: 'free' }),
          { pinned: 'anthropic:claude-opus-5' }
        )
      ).resolves.toEqual({
        kind: 'unavailable',
        reason: 'key_removed',
        suggestedModel: 'openrouter:deepseek/deepseek-v3.2',
      });
    });
  });
});
