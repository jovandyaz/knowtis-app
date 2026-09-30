import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ModelIntent } from '@knowtis/shared-types';

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
  });

  describe('setUserPreferences', () => {
    it('refuses an anonymous caller', async () => {
      await expect(
        makeChooser().svc.setUserPreferences(
          createExecutionContext({ tier: 'anonymous' }),
          { preferredIntent: 'fast' }
        )
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a model outside the tier with AI_MODEL_UNAVAILABLE and a suggestion', async () => {
      const error = await makeChooser()
        .svc.setUserPreferences(createExecutionContext({ tier: 'free' }), {
          preferredModel: 'anthropic:claude-opus-5',
        })
        .catch((e: unknown) => e);
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
      const error = await svc
        .setUserPreferences(FREE_CALLER, { preferredModel: RETIRED_MODEL })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ModelUnavailableException);
      expect((error as ModelUnavailableException).getResponse()).toMatchObject({
        details: { reason: 'model_retired' },
      });
      expect(repo.patchSettings).not.toHaveBeenCalled();
    });

    it('stores a model inside the byok scope', async () => {
      const { svc, repo } = makeChooser();
      await svc.setUserPreferences(
        createExecutionContext({ tier: 'byok', byokProviders: ['anthropic'] }),
        { preferredModel: 'anthropic:claude-opus-5' }
      );
      expect(repo.patchSettings).toHaveBeenCalledWith('user-1', {
        preferredModel: 'anthropic:claude-opus-5',
      });
    });

    it('clears the model without reading the catalog', async () => {
      const { svc, repo, selectable } = makeChooser();
      const catalogFor = vi.spyOn(selectable, 'catalogFor');
      await svc.setUserPreferences(FREE_CALLER, { preferredModel: null });
      expect(repo.patchSettings).toHaveBeenCalledWith('user-1', {
        preferredModel: null,
      });
      expect(catalogFor).not.toHaveBeenCalled();
    });

    it('skips the write when the patch carries no values', async () => {
      const { svc, repo } = makeChooser();
      await svc.setUserPreferences(FREE_CALLER, {});
      const dtoShaped: Parameters<typeof svc.setUserPreferences>[1] = {};
      Object.assign(dtoShaped, {
        preferredModel: undefined,
        preferredIntent: undefined,
      });
      await svc.setUserPreferences(FREE_CALLER, dtoShaped);
      expect(repo.patchSettings).not.toHaveBeenCalled();
    });

    it('passes an intent-only patch through unvalidated', async () => {
      const { svc, repo } = makeChooser();
      await svc.setUserPreferences(FREE_CALLER, { preferredIntent: 'fast' });
      expect(repo.patchSettings).toHaveBeenCalledWith('user-1', {
        preferredIntent: 'fast',
      });
    });

    it('stores a ghost text patch without validating a model', async () => {
      const { svc, repo, selectable } = makeChooser();
      const catalogFor = vi.spyOn(selectable, 'catalogFor');
      await svc.setUserPreferences(FREE_CALLER, { ghostTextEnabled: false });
      expect(repo.patchSettings).toHaveBeenCalledWith('user-1', {
        ghostTextEnabled: false,
      });
      expect(catalogFor).not.toHaveBeenCalled();
    });
  });

  describe('getUserPreferences', () => {
    it('returns the stored model and intent', async () => {
      const { svc } = makeChooser({
        preferredModel: 'openai:gpt-4o-mini',
        preferredIntent: 'powerful',
      });
      expect(await svc.getUserPreferences('u1')).toEqual({
        preferredModel: 'openai:gpt-4o-mini',
        preferredIntent: 'powerful',
        ghostTextEnabled: true,
      });
    });

    it('returns the ghost text preference', async () => {
      const { svc, repo } = makeChooser();
      repo.getSettings.mockResolvedValue({
        preferredModel: null,
        preferredIntent: null,
        ghostTextEnabled: false,
      });
      expect((await svc.getUserPreferences('u1')).ghostTextEnabled).toBe(false);
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
