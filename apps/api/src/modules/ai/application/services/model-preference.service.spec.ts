import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN,
  type ModelIntent,
  type SelectableModel,
} from '@knowtis/shared-types';

import { createExecutionContext } from '../../testing/create-execution-context';
import { ModelPreferenceService } from './model-preference.service';
import { SelectableModelsService } from './selectable-models.service';

const SYSTEM_DEFAULT = 'anthropic:claude-sonnet-4-20250514';
const INTENT_MODELS: Record<ModelIntent, string> = {
  fast: 'openrouter:fast-mock',
  balanced: SYSTEM_DEFAULT,
  powerful: 'openrouter:deep-mock',
};

function make(
  pref: string | null,
  selectable: string[],
  byokProviders: string[] = [],
  preferredIntent: ModelIntent | null = null,
  intentModels: Record<ModelIntent, string> = INTENT_MODELS
) {
  const repo = {
    getSettings: vi.fn().mockResolvedValue({
      preferredModel: pref,
      preferredIntent,
      ghostTextEnabled: true,
    }),
    patchSettings: vi.fn().mockResolvedValue(undefined),
  };
  const ceilingsSeen: (number | undefined)[] = [];
  const selectableSvc = {
    isSelectable: (
      id: string,
      _configured: ReadonlySet<string>,
      providers?: ReadonlySet<string>,
      maxOutputCostPerToken?: number
    ) => {
      ceilingsSeen.push(maxOutputCostPerToken);
      const hasKey = Boolean(providers?.has(id.split(':')[0]));
      return selectable.includes(id) || hasKey;
    },
    list: (
      _systemDefault: string,
      _configured: ReadonlySet<string>,
      providers?: ReadonlySet<string>
    ) => {
      const unlocked = providers
        ? byokProviders
            .filter((p) => providers.has(p))
            .map((p) => `${p}:byok-model`)
        : [];
      return [...selectable, ...unlocked].map((id) => ({ id }));
    },
  };
  const aiConfig = {
    getDefaultModel: vi.fn().mockResolvedValue(SYSTEM_DEFAULT),
    getFreeTierMaxOutputCostPerToken: vi
      .fn()
      .mockResolvedValue(FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN),
    getIntentModels: vi.fn().mockResolvedValue(intentModels),
    getConfiguredModelIds: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Set([SYSTEM_DEFAULT, ...Object.values(intentModels)])
        )
      ),
  };
  const byok = {
    enabledProviders: vi.fn().mockResolvedValue(new Set(byokProviders)),
  };
  const svc = new ModelPreferenceService(
    repo as never,
    selectableSvc as never,
    aiConfig as never,
    byok as never
  );
  return { svc, repo, aiConfig, byok, ceilingsSeen, selectableSvc };
}

function makeChooser(
  settings: {
    preferredModel?: string | null;
    preferredIntent?: ModelIntent | null;
  } = {}
) {
  const selectable = new SelectableModelsService(
    {
      isSupported: () => true,
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
    aiConfig as never,
    { enabledProviders: vi.fn() } as never
  );
  return { svc, repo };
}

const USER = { id: 'u1' };
const ANON = { id: 'anon-1', isAnonymous: true };
const NO_KEYS: ReadonlySet<string> = new Set();
const CURATED_DIRECT_MODEL = 'anthropic:claude-opus-5';

function entry(
  over: Partial<SelectableModel> & { id: string }
): SelectableModel {
  return {
    label: over.id,
    descriptionKey: '',
    tier: 'open',
    contextWindow: 200000,
    costClass: 1,
    isDefault: false,
    billedToUser: false,
    routableByServer: true,
    access: 'granted',
    ...over,
  };
}

const FULL_LISTING: SelectableModel[] = [
  entry({
    id: INTENT_MODELS.fast,
    tier: 'fast',
    servesIntent: 'fast',
    reasoning: { levels: ['low', 'medium', 'high'], mandatory: false },
  }),
  entry({
    id: SYSTEM_DEFAULT,
    tier: 'balanced',
    servesIntent: 'balanced',
    isDefault: true,
  }),
  entry({
    id: INTENT_MODELS.powerful,
    tier: 'powerful',
    servesIntent: 'powerful',
  }),
  entry({
    id: CURATED_DIRECT_MODEL,
    reasoning: { levels: ['low', 'medium', 'high'], mandatory: false },
  }),
  entry({ id: 'openrouter:promoted-mock' }),
  entry({ id: 'google:byok-model', billedToUser: true }),
];

describe('ModelPreferenceService', () => {
  it('setUserPreferences rejects an unselectable model', async () => {
    const { svc, repo } = make(null, [SYSTEM_DEFAULT]);
    await expect(
      svc.setUserPreferences(USER, { preferredModel: 'openai:nope' })
    ).rejects.toThrow(BadRequestException);
    expect(repo.patchSettings).not.toHaveBeenCalled();
  });

  it('setUserPreferences clears the model without validation', async () => {
    const { svc, repo } = make('x', [SYSTEM_DEFAULT]);
    await svc.setUserPreferences(USER, { preferredModel: null });
    expect(repo.patchSettings).toHaveBeenCalledWith('u1', {
      preferredModel: null,
    });
  });

  it('setUserPreferences skips the write when the patch carries no values', async () => {
    const { svc, repo } = make(null, [SYSTEM_DEFAULT]);
    await svc.setUserPreferences(USER, {});
    const dtoShaped: Parameters<typeof svc.setUserPreferences>[1] = {};
    Object.assign(dtoShaped, {
      preferredModel: undefined,
      preferredIntent: undefined,
    });
    await svc.setUserPreferences(USER, dtoShaped);
    expect(repo.patchSettings).not.toHaveBeenCalled();
  });

  it('listModels includes a BYOK-unlocked provider model', async () => {
    const { svc, byok } = make(null, [SYSTEM_DEFAULT], ['google']);
    const ids = (await svc.listModels(USER)).map((m) => m.id);
    expect(ids.some((id) => id.startsWith('google:'))).toBe(true);
    expect(byok.enabledProviders).toHaveBeenCalledWith('u1', false);
  });

  it('setUserPreferences accepts a model unlocked by a BYOK key', async () => {
    const { svc, repo } = make(null, [SYSTEM_DEFAULT], ['google']);
    await svc.setUserPreferences(USER, {
      preferredModel: 'google:gemini-3.7-flash',
    });
    expect(repo.patchSettings).toHaveBeenCalledWith('u1', {
      preferredModel: 'google:gemini-3.7-flash',
    });
  });

  it('setUserPreferences passes an intent-only patch through unvalidated', async () => {
    const { svc, repo } = make(null, [SYSTEM_DEFAULT]);
    await svc.setUserPreferences(USER, { preferredIntent: 'fast' });
    expect(repo.patchSettings).toHaveBeenCalledWith('u1', {
      preferredIntent: 'fast',
    });
  });

  it('getUserPreferences returns the stored model and intent', async () => {
    const { svc } = make(
      'openai:gpt-4o-mini',
      [SYSTEM_DEFAULT],
      [],
      'powerful'
    );
    expect(await svc.getUserPreferences('u1')).toEqual({
      preferredModel: 'openai:gpt-4o-mini',
      preferredIntent: 'powerful',
      ghostTextEnabled: true,
    });
  });

  it('getUserPreferences returns the ghost text preference', async () => {
    const { svc, repo } = make(null, [SYSTEM_DEFAULT]);
    repo.getSettings.mockResolvedValue({
      preferredModel: null,
      preferredIntent: null,
      ghostTextEnabled: false,
    });
    expect((await svc.getUserPreferences('u1')).ghostTextEnabled).toBe(false);
  });

  it('setUserPreferences stores a ghost text patch without validating a model', async () => {
    const { svc, repo, selectableSvc } = make(null, [SYSTEM_DEFAULT]);
    const isSelectable = vi.spyOn(selectableSvc, 'isSelectable');
    await svc.setUserPreferences(USER, { ghostTextEnabled: false });
    expect(repo.patchSettings).toHaveBeenCalledWith('u1', {
      ghostTextEnabled: false,
    });
    expect(isSelectable).not.toHaveBeenCalled();
  });

  describe('anonymous sessions', () => {
    function makeWithListing() {
      const made = make(null, [SYSTEM_DEFAULT]);
      made.selectableSvc.list = () => FULL_LISTING;
      return made;
    }

    it('anonymous listing returns only intent entries with requires_account on the locked ones', async () => {
      const { svc } = makeWithListing();
      const listing = await svc.listModels(ANON);
      expect(listing.map((m) => m.id)).toEqual([
        INTENT_MODELS.fast,
        SYSTEM_DEFAULT,
        INTENT_MODELS.powerful,
      ]);
      const byId = new Map(listing.map((m) => [m.id, m]));
      expect(byId.get(SYSTEM_DEFAULT)?.access).toBe('granted');
      expect(byId.get(INTENT_MODELS.fast)?.access).toBe('requires_account');
      expect(byId.get(INTENT_MODELS.powerful)?.access).toBe('requires_account');
      expect(byId.get(INTENT_MODELS.fast)?.reasoning).toEqual({
        levels: ['low', 'medium', 'high'],
        mandatory: false,
      });
      expect(listing.every((m) => !m.billedToUser)).toBe(true);
    });

    it('anonymous listing never includes promoted or byok-only entries', async () => {
      const { svc } = makeWithListing();
      const ids = (await svc.listModels(ANON)).map((m) => m.id);
      expect(ids).not.toContain('openrouter:promoted-mock');
      expect(ids).not.toContain('google:byok-model');
    });

    it('keeps an anonymous listing off the stored byok providers', async () => {
      const { svc, byok } = makeWithListing();
      await svc.listModels(ANON);
      expect(byok.enabledProviders).toHaveBeenCalledWith(ANON.id, true);
    });

    it('setUserPreferences rejects anonymous users', async () => {
      const { svc, repo } = make(null, [SYSTEM_DEFAULT]);
      await expect(
        svc.setUserPreferences(ANON, { preferredIntent: 'fast' })
      ).rejects.toThrow(ForbiddenException);
      expect(repo.patchSettings).not.toHaveBeenCalled();
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

  // Without this the ceiling can stop being forwarded and nothing else notices:
  // every downstream call falls back to the code default and still answers.
  describe('forwards the operator ceiling', () => {
    const CONFIGURED_CEILING = 0.0000025;

    function withCeiling(stored: string | null = null) {
      const made = make(stored, [SYSTEM_DEFAULT]);
      made.aiConfig.getFreeTierMaxOutputCostPerToken.mockResolvedValue(
        CONFIGURED_CEILING
      );
      return made;
    }

    it('passes the resolved ceiling when storing a preference', async () => {
      const { svc, ceilingsSeen } = withCeiling();

      await svc.setUserPreferences(USER, { preferredModel: SYSTEM_DEFAULT });

      expect(ceilingsSeen).toContain(CONFIGURED_CEILING);
    });
  });
});
